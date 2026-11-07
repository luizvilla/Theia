// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { BoardService } from '../common/board-protocol';
import {
    ProcedureClient, ProcedureEvent, ProcedureInfo, ProcedureService
} from '../common/procedure-protocol';
import { MissionService } from './mission-service';
import { BoardModel } from './board-model';

export const RUN_PROCEDURE_COMMAND = { id: 'ownstudio.procedure.run', category: 'OwnStudio', label: 'Run a Procedure…' };

@injectable()
export class ProcedureClientImpl implements ProcedureClient {
    protected readonly emitter = new Emitter<{ runId: number; event: ProcedureEvent }>();
    readonly onEvent = this.emitter.event;
    onProcedureEvent(runId: number, event: ProcedureEvent): void {
        this.emitter.fire({ runId, event });
    }
}

export interface ProcedureRun {
    runId: number;
    info: ProcedureInfo;
    target: 'simulator' | 'board';
    started: Date;
    log: string[];
    ask?: { id: number; kind: 'number' | 'confirm'; question: string };
    records: { path: string; verdict: string }[];
    done?: { status: number; error?: string };
}

/**
 * The mission's procedures and the run in progress. A run on the board that
 * switches the converter on asks the user each time (ADR 0010), and the board
 * link is handed over to the procedure's own process while it runs.
 */
@injectable()
export class ProcedureModel {
    @inject(ProcedureService) protected readonly service: ProcedureService;
    @inject(ProcedureClientImpl) protected readonly client: ProcedureClientImpl;
    @inject(BoardService) protected readonly boards: BoardService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    procedures: ProcedureInfo[] = [];
    problem: string | undefined;
    current: ProcedureRun | undefined;
    protected restoreBoard: (() => Promise<void>) | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.client.onEvent(({ runId, event }) => this.receive(runId, event));
        this.missions.onDidChange(() => this.refresh());
        this.missions.onDidChangeFiles(uris => uris.some(u => u.path.toString().includes('/tests/procedures/')) && this.refresh());
        this.refresh();
    }

    get running(): boolean {
        return !!this.current && !this.current.done;
    }

    async refresh(): Promise<void> {
        const root = this.missions.root;
        if (!root || !this.missions.mission) {
            this.procedures = [];
        } else {
            try {
                this.procedures = await this.boards.procedures(root.path.fsPath());
                this.problem = undefined;
            } catch (error) {
                this.procedures = [];
                this.problem = error instanceof Error ? error.message : String(error);
            }
        }
        this.onDidChangeEmitter.fire();
    }

    /** Returns false if the user declined or nothing could start. */
    async run(info: ProcedureInfo, target: 'simulator' | 'board'): Promise<boolean> {
        const root = this.missions.root;
        if (!root || this.running) {
            return false;
        }
        let board: string | undefined;
        if (target === 'board') {
            const running = this.board.boards.filter(b => !b.in_bootloader);
            board = this.board.link?.serial_number ?? (running.length === 1 ? running[0].serial_number : undefined);
            if (!board) {
                this.problem = 'Connect exactly one board to run a procedure on it.';
                this.onDidChangeEmitter.fire();
                return false;
            }
            if (info.power_on) {
                const ok = await new ConfirmDialog({
                    title: 'Switch the converter on?',
                    msg: `"${info.title}" switches the converter of board ${board} on. Check that the supply is `
                        + 'current-limited and the load is connected, and stay at the bench. The procedure switches '
                        + 'it off at the end or on any error.',
                    ok: 'Switch on and run',
                    cancel: 'Cancel',
                }).open();
                if (!ok) {
                    return false;
                }
            }
            this.restoreBoard = await this.board.release();
        }
        this.current = { runId: -1, info, target, started: new Date(), log: [], records: [] };
        this.onDidChangeEmitter.fire();
        try {
            this.current.runId = await this.service.start({
                python: this.preferences.get<string>('ownstudio.python', ''),
                mission: root.path.fsPath(), procedure: info.path, target, board,
                allowPower: target === 'board' && info.power_on,
            });
        } catch (error) {
            this.finish({ status: 2, error: error instanceof Error ? error.message : String(error) });
            return false;
        }
        return true;
    }

    async answer(value: number | boolean | null): Promise<void> {
        const run = this.current;
        if (run?.ask) {
            const id = run.ask.id;
            run.ask = undefined;
            this.onDidChangeEmitter.fire();
            await this.service.answer(run.runId, id, value);
        }
    }

    async stop(): Promise<void> {
        if (this.current && !this.current.done) {
            await this.service.stop(this.current.runId);
        }
    }

    protected receive(runId: number, event: ProcedureEvent): void {
        const run = this.current;
        if (!run || run.runId !== runId) {
            return;
        }
        switch (event.event) {
            case 'log': run.log.push(event.text); break;
            case 'ask': run.ask = { id: event.id, kind: event.kind, question: event.question }; break;
            case 'record': run.records.push({ path: event.path, verdict: event.verdict }); break;
            case 'done': this.finish(event); return;
        }
        this.onDidChangeEmitter.fire();
    }

    protected async finish(done: { status: number; error?: string }): Promise<void> {
        if (this.current) {
            this.current.done = done;
            this.current.ask = undefined;
        }
        this.onDidChangeEmitter.fire();
        const restore = this.restoreBoard;
        this.restoreBoard = undefined;
        await restore?.();
        await this.missions.refreshTests();
    }
}
