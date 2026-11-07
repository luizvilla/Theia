// SPDX-License-Identifier: LGPL-2.1-only
import { injectable } from '@theia/core/shared/inversify';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { BackendApplicationPath } from '@theia/core/lib/node/backend-application';
import {
    BoardClient, BoardInfo, BoardService, BoardStatus, LinkInfo, MissionIdentity
} from '../common/board-protocol';
import { TestStates } from '../common/test-states';
import { ProcedureInfo } from '../common/procedure-protocol';

interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; }

/**
 * Runs `python -m ownstudio_lab.bridge` and forwards calls to it as JSON
 * lines. The bridge is started on the first call and again after it exits.
 * It answers one request at a time, in order.
 */
@injectable()
export class BoardServiceImpl implements BoardService {

    protected client: BoardClient | undefined;
    protected python = BoardServiceImpl.defaultPython();
    protected mcumgr = process.env.OWNSTUDIO_MCUMGR || '';

    static defaultPython(): string {
        return process.env.OWNSTUDIO_PYTHON || 'python3';
    }
    protected bridge: ChildProcessWithoutNullStreams | undefined;
    protected pending = new Map<number, Pending>();
    protected nextId = 1;
    protected stderr = '';

    setClient(client: BoardClient | undefined): void {
        this.client = client;
    }

    /** Empty values fall back to the environment (OWNSTUDIO_PYTHON, OWNSTUDIO_MCUMGR). */
    async configure(python: string, mcumgr: string): Promise<void> {
        const wanted = python || BoardServiceImpl.defaultPython();
        if (wanted !== this.python) {
            this.python = wanted;
            this.bridge?.kill();
        }
        this.mcumgr = mcumgr || process.env.OWNSTUDIO_MCUMGR || '';
    }

    status(): Promise<BoardStatus> { return this.call('status') as Promise<BoardStatus>; }
    connect(serialNumber: string): Promise<LinkInfo> { return this.call('connect', { serial_number: serialNumber }) as Promise<LinkInfo>; }
    async disconnect(): Promise<void> { await this.call('disconnect'); }
    get(path: string): Promise<unknown> { return this.call('get', { path }); }
    async update(group: string, values: Record<string, unknown>): Promise<void> { await this.call('update', { group, values }); }
    identity(missionPath: string): Promise<MissionIdentity> { return this.call('identity', { mission: missionPath }) as Promise<MissionIdentity>; }
    design(missionPath: string, script: string, args: (string | number)[]): Promise<unknown> {
        return this.call('design', { mission: missionPath, script, args });
    }
    procedures(missionPath: string): Promise<ProcedureInfo[]> {
        return this.call('procedures', { mission: missionPath }) as Promise<ProcedureInfo[]>;
    }
    tests(missionPath: string): Promise<TestStates> { return this.call('tests', { mission: missionPath }) as Promise<TestStates>; }

    flash(manifestPath: string, serialNumber?: string): Promise<BoardInfo> {
        const params: Record<string, unknown> = { manifest: manifestPath, serial_number: serialNumber ?? null };
        if (this.mcumgr) {
            params.mcumgr = this.mcumgr;
        }
        return this.call('flash', params) as Promise<BoardInfo>;
    }

    /**
     * Board packs are looked up in OWNSTUDIO_BOARD_PACKS (a list of folders),
     * then in the packs shipped with the application.
     */
    async boardPack(name: string): Promise<{ path: string; text: string } | undefined> {
        if (!/^[a-z0-9_-]+$/.test(name)) {
            return undefined;
        }
        const dirs = [...(process.env.OWNSTUDIO_BOARD_PACKS ?? '').split(path.delimiter).filter(Boolean),
            path.join(BackendApplicationPath, 'boardpacks')];
        for (const dir of dirs) {
            const file = path.join(dir, name, 'board.yaml');
            try {
                return { path: file, text: await fs.promises.readFile(file, 'utf8') };
            } catch {
                continue;
            }
        }
        return undefined;
    }

    dispose(): void {
        this.bridge?.kill();
    }

    protected call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        const bridge = this.start();
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            bridge.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }

    protected start(): ChildProcessWithoutNullStreams {
        if (this.bridge && this.bridge.exitCode === null && !this.bridge.killed) {
            return this.bridge;
        }
        const bridge = spawn(this.python, ['-m', 'ownstudio_lab.bridge'], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        this.bridge = bridge;
        this.stderr = '';
        readline.createInterface({ input: bridge.stdout }).on('line', line => this.receive(line));
        bridge.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-2000); });
        const fail = (why: string) => {
            if (this.bridge === bridge) {
                this.bridge = undefined;
            }
            const error = new Error(`${why}${this.stderr ? ': ' + this.stderr.trim().split('\n').pop() : ''}`);
            for (const pending of this.pending.values()) {
                pending.reject(error);
            }
            this.pending.clear();
        };
        bridge.on('error', err => fail(`cannot start ${this.python} (${err.message})`));
        bridge.on('exit', code => fail(`the board bridge stopped (exit ${code})`));
        return bridge;
    }

    protected receive(line: string): void {
        let message: { id?: number; result?: unknown; error?: string; event?: string; text?: string };
        try {
            message = JSON.parse(line);
        } catch {
            return;
        }
        if (message.event === 'log') {
            this.client?.onFlashLog(message.text ?? '');
            return;
        }
        const pending = message.id !== undefined ? this.pending.get(message.id) : undefined;
        if (!pending) {
            return;
        }
        this.pending.delete(message.id!);
        if (message.error !== undefined) {
            pending.reject(new Error(message.error));
        } else {
            pending.resolve(message.result);
        }
    }
}
