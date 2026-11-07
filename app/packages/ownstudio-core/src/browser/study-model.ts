// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MissionService } from './mission-service';
import { StudyEvent, StudyEventKind, parseLog, stepTimesCsv, validParticipant } from '../common/study';

/**
 * The mission steps a student works through, and the study log.
 *
 * Steps work without the study: the student opens each one and marks it done.
 * Only after consent, and only then, each start and "done" is appended to
 * <config folder>/ownstudio-study/<participant>.jsonl, outside the mission
 * folder (so it never ends up in a student's commits) and on this computer only.
 * Withdrawing deletes the log.
 */
@injectable()
export class StudyModel {
    @inject(FileService) protected readonly files: FileService;
    @inject(EnvVariablesServer) protected readonly env: EnvVariablesServer;
    @inject(MissionService) protected readonly missions: MissionService;

    participant: string | undefined;
    events: StudyEvent[] = [];
    /** Steps marked done in this session (with or without the study). */
    readonly done = new Set<string>();
    /** The step being worked on. */
    current: string | undefined;
    problem: string | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.missions.onDidChange(() => this.onDidChangeEmitter.fire());
    }

    get missionId(): string {
        return this.missions.mission?.id || 'mission';
    }

    async folder(): Promise<URI> {
        return new URI(await this.env.getConfigDirUri()).resolve('ownstudio-study');
    }

    protected async logUri(participant: string): Promise<URI> {
        return (await this.folder()).resolve(`${participant}.jsonl`);
    }

    /** Start the study for a participant code (no name). Earlier events of the same code are kept. */
    async consent(participant: string): Promise<boolean> {
        if (!validParticipant(participant)) {
            this.problem = 'A participant code is letters, digits and dashes only (for example P03): no name.';
            this.onDidChangeEmitter.fire();
            return false;
        }
        this.problem = undefined;
        this.participant = participant;
        const uri = await this.logUri(participant);
        this.events = await this.files.exists(uri) ? parseLog((await this.files.read(uri)).value) : [];
        for (const e of this.events) {
            if (e.kind === 'step-done' && e.step) {
                this.done.add(e.step);
            }
        }
        await this.log('consent');
        return true;
    }

    /** Stop the study and delete this participant's log. */
    async withdraw(): Promise<void> {
        if (!this.participant) {
            return;
        }
        const uri = await this.logUri(this.participant);
        if (await this.files.exists(uri)) {
            await this.files.delete(uri);
        }
        this.participant = undefined;
        this.events = [];
        this.onDidChangeEmitter.fire();
    }

    async start(step: string): Promise<void> {
        this.current = step;
        await this.log('step-start', step);
    }

    async finish(step: string): Promise<void> {
        this.done.add(step);
        if (this.current === step) {
            this.current = undefined;
        }
        await this.log('step-done', step);
    }

    async submit(kind: 'sus' | 'answers', data: number[] | Record<string, string>): Promise<void> {
        await this.log(kind, undefined, data);
    }

    /** Write <participant>-steps.csv next to the log; returns its URI. */
    async exportCsv(): Promise<URI | undefined> {
        if (!this.participant) {
            return undefined;
        }
        const uri = (await this.folder()).resolve(`${this.participant}-steps.csv`);
        await this.files.write(uri, stepTimesCsv(this.participant, this.missionId, this.events));
        return uri;
    }

    protected async log(kind: StudyEventKind, step?: string, data?: StudyEvent['data']): Promise<void> {
        if (this.participant) {
            const event: StudyEvent = { t: new Date().toISOString(), participant: this.participant, mission: this.missionId, kind };
            if (step) {
                event.step = step;
            }
            if (data) {
                event.data = data;
            }
            this.events.push(event);
            const uri = await this.logUri(this.participant);
            try {
                await this.files.write(uri, this.events.map(e => JSON.stringify(e)).join('\n') + '\n');
            } catch (error) {
                this.problem = `The study log could not be written: ${error instanceof Error ? error.message : error}`;
            }
        }
        this.onDidChangeEmitter.fire();
    }
}
