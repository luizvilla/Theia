// SPDX-License-Identifier: LGPL-2.1-only
// Plan U18 (SPEC §13, S7, storyboard frame 14): the setup's timeline. It polls
// HEAD cheaply; when HEAD moves to a new dot it rereads the strip, and when the
// setup is put somewhere else (a restore, back to latest, a new branch, or a
// checkout made outside OwnStudio) every view that holds setup state reloads.
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AsyncEmitter, CommandService, Emitter, MessageService, WaitUntilEvent } from '@theia/core/lib/common';
import { CommonCommands } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { DotPreview, SetupService, TimelineDot, TimelineStrip } from '../common/setup-protocol.js';

const POLL_MS = 1500;

@injectable()
export class TimelineModel {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    /** Before a restore or a branch: views write what they hold (the canvas commits its pending edits). */
    protected readonly onWillMoveEmitter = new AsyncEmitter<WaitUntilEvent>();
    readonly onWillMove = this.onWillMoveEmitter.event;
    /** The setup was put somewhere else: views read it again (editors reload from disk by themselves). */
    protected readonly onDidMoveEmitter = new AsyncEmitter<WaitUntilEvent>();
    readonly onDidMove = this.onDidMoveEmitter.event;

    folder: string | undefined;
    strip: TimelineStrip | undefined;
    selected: string | undefined;
    preview: DotPreview | undefined;
    busy = false;
    protected timer: ReturnType<typeof setInterval> | undefined;
    protected polling = false;

    @postConstruct()
    protected init(): void {
        void this.start();
        this.workspace.onWorkspaceChanged(() => void this.start());
    }

    protected async start(): Promise<void> {
        clearInterval(this.timer);
        const folder = (await this.workspace.roots)[0]?.resource.path.fsPath();
        this.folder = folder && await this.setups.isSetup(folder) ? folder : undefined;
        this.strip = undefined;
        if (this.folder) {
            await this.refresh();
            this.timer = setInterval(() => void this.poll(), POLL_MS);
        }
        this.onDidChangeEmitter.fire();
    }

    /** Rereads the strip; reloads the views when the setup was put somewhere else than its next dot. */
    async refresh(): Promise<void> {
        if (!this.folder) {
            return;
        }
        const before = this.strip;
        try {
            this.strip = await this.setups.timelineStrip(this.folder);
        } catch (error) {
            console.error('timeline not read', error);
            return;
        }
        const moved = before && (before.branch !== this.strip.branch
            || (before.head !== this.strip.head && !this.strip.dots.some(d => d.commit === before.head)));
        if (moved) {
            await this.reloadViews();
        }
        if (this.selected && this.preview && !this.busy) {
            await this.select(this.selected, false);
        }
        this.onDidChangeEmitter.fire();
    }

    protected async poll(): Promise<void> {
        if (!this.folder || this.polling || this.busy || document.hidden) {
            return;
        }
        this.polling = true;
        try {
            const head = await this.setups.head(this.folder);
            if (head.head !== this.strip?.head || head.branch !== this.strip?.branch) {
                await this.refresh();
            }
        } finally {
            this.polling = false;
        }
    }

    protected async reloadViews(): Promise<void> {
        await this.onDidMoveEmitter.fire({});
    }

    dot(commit: string | undefined): TimelineDot | undefined {
        return this.strip?.dots.find(d => d.commit === commit);
    }

    async select(commit: string, fire = true): Promise<void> {
        if (!this.folder) {
            return;
        }
        this.selected = commit;
        try {
            this.preview = await this.setups.previewDot(this.folder, commit);
        } catch (error) {
            this.messages.error(`This dot cannot be shown: ${error instanceof Error ? error.message : error}`);
        }
        if (fire) {
            this.onDidChangeEmitter.fire();
        }
    }

    /** Saves editors and canvas, then runs a git move; the views follow. */
    protected async move(what: string, action: (folder: string) => Promise<unknown>): Promise<boolean> {
        if (!this.folder || this.busy) {
            return false;
        }
        this.busy = true;
        this.onDidChangeEmitter.fire();
        try {
            await this.commands.executeCommand(CommonCommands.SAVE_ALL.id);
            await this.onWillMoveEmitter.fire({});
            await action(this.folder);
            return true;
        } catch (error) {
            this.messages.error(`${what} failed: ${error instanceof Error ? error.message : error}`);
            return false;
        } finally {
            this.busy = false;
            const before = this.strip;
            this.strip = await this.setups.timelineStrip(this.folder).catch(() => this.strip);
            if (before?.head !== this.strip?.head || before?.branch !== this.strip?.branch) {
                await this.reloadViews();
            }
            if (this.selected) {
                await this.select(this.selected, false);
            }
            this.onDidChangeEmitter.fire();
        }
    }

    restore(commit: string): Promise<boolean> {
        return this.move('Restore', folder => this.setups.restoreDot(folder, commit));
    }

    back(): Promise<boolean> {
        return this.move('Back to latest', folder => this.setups.backToLatest(folder));
    }

    milestone(name: string): Promise<boolean> {
        return this.move('Milestone', folder => this.setups.milestone(folder, name));
    }

    newBranch(name: string): Promise<boolean> {
        return this.move('New branch', folder => this.setups.newBranch(folder, name));
    }
}
