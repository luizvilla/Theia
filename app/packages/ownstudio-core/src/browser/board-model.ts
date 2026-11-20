// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import {
    BoardClient, BoardInfo, BoardService, FirmwareState, LinkInfo, MissionIdentity, firmwareState
} from '../common/board-protocol.js';
import { MissionService } from './mission-service.js';
import { SetupService } from '../common/setup-protocol.js';
import { BuildService } from '../common/build-protocol.js';

export const POLL_MS = 2000;
const RETRY_MS = 10000;

/** Receives the backend's flash log lines. */
@injectable()
export class BoardClientImpl implements BoardClient {
    protected readonly onFlashLogEmitter = new Emitter<string>();
    readonly onFlashLogEvent = this.onFlashLogEmitter.event;
    onFlashLog(text: string): void {
        this.onFlashLogEmitter.fire(text);
    }
}

/**
 * What the app knows about the board: which boards are plugged in, the
 * ThingSet link (opened automatically when exactly one board runs a
 * firmware), and how its firmware relates to the open mission.
 */
@injectable()
export class BoardModel {

    @inject(BoardService) protected readonly service: BoardService;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(BuildService) protected readonly builds: BuildService;

    boards: BoardInfo[] = [];
    /** F8: the serial number this setup works with (Board › Select board…), when several are plugged in. */
    chosen: string | undefined;
    link: LinkInfo | undefined;
    identity: MissionIdentity | undefined;
    problem: string | undefined;
    busy = false;     // a flash is running: no polling, no auto-connect
    /** F19: the open folder is a setup (built and uploaded by Board › Build/Upload), not a 1.0 mission. */
    setup = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected failed = new Map<string, number>();   // serial number -> time of the last failed connect
    protected timer: ReturnType<typeof setInterval> | undefined;
    protected polling = false;
    protected identityTimer: ReturnType<typeof setTimeout> | undefined;

    get firmware(): FirmwareState {
        return firmwareState(this.link?.build ?? null, this.identity);
    }

    @postConstruct()
    protected init(): void {
        this.missions.onDidChange(() => { void this.refreshIdentity(); void this.loadChoice(); });
        this.missions.onDidChangeFiles(uris => {
            if (uris.some(uri => /\/(firmware|bin)\/|data_objects\.yaml$/.test(uri.path.toString()))) {
                clearTimeout(this.identityTimer);
                this.identityTimer = setTimeout(() => this.refreshIdentity(), 500);
            }
        });
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName.startsWith('ownstudio.')) {
                this.configure();
            }
        });
    }

    async start(): Promise<void> {
        await this.preferences.ready;
        await this.configure();
        await this.refreshIdentity();
        await this.loadChoice();
        await this.poll();
        this.timer = setInterval(() => this.poll(), POLL_MS);
    }

    /** The board OwnStudio works with: the chosen one when plugged in, else the only one running a firmware. */
    get target(): string | undefined {
        const running = this.boards.filter(b => !b.in_bootloader);
        if (this.chosen && this.boards.some(b => b.serial_number === this.chosen)) {
            return this.chosen;
        }
        return running.length === 1 ? running[0].serial_number : this.boards.length === 1 ? this.boards[0].serial_number : undefined;
    }

    /** Several boards and none chosen (or the chosen one is not plugged in): the user picks one. */
    get needsChoice(): boolean {
        return this.boards.length > 1 && !this.target;
    }

    protected async loadChoice(): Promise<void> {
        const folder = this.missions.root?.path.fsPath();
        const setup = folder ? await this.setups.isSetup(folder).catch(() => false) : false;
        this.chosen = folder && setup ? await this.setups.boardChoice(folder).catch(() => undefined) : undefined;
        const pending = pendingChoice();
        if (folder && setup && !this.chosen && pending) {
            // F19: a board chosen on the Start page goes to the setup opened next
            // (opening a setup reloads the window, which used to drop the choice).
            await this.setups.setBoardChoice(folder, pending).catch(() => undefined);
            this.chosen = pending;
        }
        if (folder && setup) {
            pendingChoice(null);
        }
        this.onDidChangeEmitter.fire();
    }

    /** F8: remembers the choice in the setup and links to that board; with no setup open, until one opens (F19). */
    async choose(serial: string): Promise<void> {
        const folder = this.missions.root?.path.fsPath();
        if (folder && await this.setups.isSetup(folder).catch(() => false)) {
            await this.setups.setBoardChoice(folder, serial);
        } else {
            pendingChoice(serial);
        }
        this.chosen = serial;
        this.failed.clear();
        if (this.link && this.link.serial_number !== serial) {
            await this.service.disconnect();
            this.link = undefined;
        }
        this.onDidChangeEmitter.fire();
        await this.poll();
    }

    async refreshIdentity(): Promise<void> {
        const root = this.missions.root;
        try {
            if (!root) {
                this.identity = undefined;
                this.setup = false;
            } else {
                const folder = root.path.fsPath();
                this.setup = await this.setups.isSetup(folder).catch(() => false);
                try {
                    const [sources, built] = await Promise.all([this.builds.identity(folder), this.builds.lastBuild(folder)]);
                    this.identity = {
                        sources,
                        prebuilt: built ? {
                            image: built.image, sha256: '', build: built.identity,
                            shield: 'twist', shield_version: 'setup',
                        } : null,
                    };
                } catch {
                    this.identity = await this.service.identity(folder);
                }
            }
        } catch (error) {
            this.identity = undefined;
            this.problem = message(error);
        }
        this.onDidChangeEmitter.fire();
    }

    async flash(serialNumber: string | undefined): Promise<BoardInfo> {
        const manifest = this.missions.resolve('bin/manifest.json');
        if (!manifest) {
            throw new Error('Open a mission first.');
        }
        this.busy = true;
        this.link = undefined;
        this.onDidChangeEmitter.fire();
        try {
            return await this.service.flash(manifest.path.fsPath(), serialNumber);
        } finally {
            this.busy = false;
            this.failed.clear();
            await this.poll();
        }
    }

    /**
     * Give the board's port to another process (a procedure on the board):
     * close the link and stop auto-connecting until the returned function is called.
     */
    async release(): Promise<() => Promise<void>> {
        this.busy = true;
        this.link = undefined;
        await this.service.disconnect();
        this.onDidChangeEmitter.fire();
        return async () => {
            this.busy = false;
            this.failed.clear();
            await this.poll();
        };
    }

    async read(path: string): Promise<unknown> {
        return this.service.get(path);
    }

    async write(group: string, values: Record<string, unknown>): Promise<void> {
        await this.service.update(group, values);
    }

    protected async configure(): Promise<void> {
        await this.service.configure(
            this.preferences.get<string>('ownstudio.python', ''),
            this.preferences.get<string>('ownstudio.mcumgr', ''));
    }

    protected async poll(): Promise<void> {
        if (this.polling || this.busy) {
            return;
        }
        this.polling = true;
        try {
            const status = await this.service.status();
            this.boards = status.boards;
            this.link = status.link ?? undefined;
            this.problem = undefined;
            const target = this.target;
            if (this.link && target && this.link.serial_number !== target) {
                await this.service.disconnect();        // linked to another board than the setup's: switch
                this.link = undefined;
            }
            if (!this.link) {
                await this.autoConnect();
            }
        } catch (error) {
            this.boards = [];
            this.link = undefined;
            this.problem = message(error);
        } finally {
            this.polling = false;
            this.onDidChangeEmitter.fire();
        }
    }

    protected async autoConnect(): Promise<void> {
        const running = this.boards.filter(b => !b.in_bootloader);
        for (const serial of [...this.failed.keys()]) {
            if (!running.some(b => b.serial_number === serial)) {
                this.failed.delete(serial);
            }
        }
        const board = running.find(b => b.serial_number === this.target);
        if (!board) {
            return;     // none running, or several and none chosen yet
        }
        const lastFailure = this.failed.get(board.serial_number);
        if (lastFailure !== undefined && Date.now() - lastFailure < RETRY_MS) {
            return;
        }
        try {
            this.link = await this.service.connect(board.serial_number);
            this.failed.delete(board.serial_number);
        } catch {
            this.failed.set(board.serial_number, Date.now());
        }
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const PENDING_CHOICE = 'ownstudio.board.pendingChoice';

/** F19: reads, sets (serial) or clears (null) the board chosen while no setup was open. */
function pendingChoice(value?: string | null): string | undefined {
    try {
        if (value === null) {
            window.localStorage.removeItem(PENDING_CHOICE);
        } else if (value !== undefined) {
            window.localStorage.setItem(PENDING_CHOICE, value);
        }
        return window.localStorage.getItem(PENDING_CHOICE) ?? undefined;
    } catch {
        return undefined;
    }
}
