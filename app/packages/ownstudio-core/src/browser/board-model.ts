// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import {
    BoardClient, BoardInfo, BoardService, FirmwareState, LinkInfo, MissionIdentity, firmwareState
} from '../common/board-protocol';
import { MissionService } from './mission-service';

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
    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    boards: BoardInfo[] = [];
    link: LinkInfo | undefined;
    identity: MissionIdentity | undefined;
    problem: string | undefined;
    busy = false;     // a flash is running: no polling, no auto-connect

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
        this.missions.onDidChange(() => this.refreshIdentity());
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
        await this.poll();
        this.timer = setInterval(() => this.poll(), POLL_MS);
    }

    async refreshIdentity(): Promise<void> {
        const root = this.missions.root;
        try {
            this.identity = root && this.missions.mission ? await this.service.identity(root.path.fsPath()) : undefined;
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
        if (running.length !== 1) {
            return;
        }
        const board = running[0];
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
