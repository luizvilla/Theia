// SPDX-License-Identifier: LGPL-2.1-only
import { injectable } from '@theia/core/shared/inversify';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ProcedureClient, ProcedureEvent, ProcedureService, ProcedureStart } from '../common/procedure-protocol.js';
import { PowerTokenStore } from './power-token.js';

/**
 * Spawns `python -m ownstudio_lab.procedure MISSION PROCEDURE --target T --json`
 * and relays each JSON line to the frontend. A procedure gets its own process,
 * so a long simulation never blocks the board bridge.
 */
@injectable()
export class ProcedureServiceImpl implements ProcedureService {
    protected client: ProcedureClient | undefined;
    protected runs = new Map<number, ChildProcessWithoutNullStreams>();
    protected nextId = 1;
    protected readonly powerTokens = new PowerTokenStore();

    setClient(client: ProcedureClient | undefined): void {
        this.client = client;
    }

    async issuePowerToken(): Promise<string> {
        return this.powerTokens.issue();
    }

    async start(o: ProcedureStart): Promise<number> {
        const runId = this.nextId++;
        const python = o.python || process.env.OWNSTUDIO_PYTHON || 'python3';
        const args = ['-m', 'ownstudio_lab.procedure', o.mission, o.procedure, '--target', o.target, '--json'];
        if (o.board) {
            args.push('--board', o.board);
        }
        if (o.fromRecord) {
            args.push('--from-record', o.fromRecord);
        }
        let tokenFolder: string | undefined;
        if (o.powerToken) {
            if (!this.powerTokens.consume(o.powerToken)) {
                throw new Error('the power token is invalid, expired or was already used');
            }
            tokenFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-power-'));
            const tokenFile = path.join(tokenFolder, 'token');
            const runnerToken = randomUUID();
            fs.writeFileSync(tokenFile, runnerToken, { mode: 0o600 });
            args.push('--power-token-file', tokenFile, '--power-token', runnerToken);
        }
        const child = spawn(python, args, { cwd: o.mission, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
        this.runs.set(runId, child);
        let done = false;
        let stderr = '';
        const send = (event: ProcedureEvent) => {
            if (event.event === 'done') {
                done = true;
            }
            this.client?.onProcedureEvent(runId, event);
        };
        readline.createInterface({ input: child.stdout }).on('line', line => {
            try {
                send(JSON.parse(line) as ProcedureEvent);
            } catch {
                send({ event: 'log', text: line });
            }
        });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
        child.on('error', err => send({ event: 'done', status: 2, error: `cannot start ${python}: ${err.message}` }));
        child.on('exit', code => {
            this.runs.delete(runId);
            if (tokenFolder) {
                fs.rmSync(tokenFolder, { recursive: true, force: true });
            }
            if (!done) {
                send({ event: 'done', status: code ?? 2, error: stderr.trim().split('\n').slice(-3).join('\n') || `stopped (exit ${code})` });
            }
        });
        return runId;
    }

    async answer(runId: number, id: number, answer: number | boolean | null): Promise<void> {
        this.runs.get(runId)?.stdin.write(JSON.stringify({ id, answer }) + '\n');
    }

    async stop(runId: number): Promise<void> {
        this.runs.get(runId)?.kill();
    }

    dispose(): void {
        for (const child of this.runs.values()) {
            child.kill();
        }
        this.runs.clear();
        this.powerTokens.clear();
    }
}
