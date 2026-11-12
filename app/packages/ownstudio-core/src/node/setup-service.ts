// SPDX-License-Identifier: LGPL-2.1-only
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { injectable } from '@theia/core/shared/inversify';
import { dump, load } from 'js-yaml';
import { BoardDefinition, ExampleLoaded, PlantSync, SetupService, SetupSummary, StartInfo, setupSlug } from '../common/setup-protocol';

const CORE_UPSTREAM = 'https://github.com/owntech-foundation/Core.git';

/**
 * Runs the Python side of setups. Locations, each overridable by environment:
 * OWNSTUDIO_HOME (setups and caches, default ~/OwnStudio), OWNSTUDIO_BOARDS
 * (board descriptions, default the repository's boards/, from the bundled backend in app/applications/electron/lib/backend), OWNSTUDIO_EXAMPLES
 * (a clone of OwnTech's examples, default <home>/.cache/examples),
 * OWNSTUDIO_CORE_UPSTREAM (what the Core mirror follows).
 */
@injectable()
export class SetupServiceImpl implements SetupService {

    protected get python(): string { return process.env.OWNSTUDIO_PYTHON || 'python3'; }
    protected get home(): string { return process.env.OWNSTUDIO_HOME || path.join(os.homedir(), 'OwnStudio'); }
    protected get boards(): string { return process.env.OWNSTUDIO_BOARDS || path.resolve(__dirname, '../../../../../boards'); }
    protected get examples(): string { return process.env.OWNSTUDIO_EXAMPLES || path.join(this.home, '.cache', 'examples'); }
    protected get mirror(): string { return path.join(this.home, '.cache', 'core.git'); }

    protected run(module: string, args: string[]): Promise<unknown> {
        return new Promise((resolve, reject) => {
            execFile(this.python, ['-m', module, ...args], { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONUNBUFFERED: '1' } },
                (error, stdout, stderr) => {
                    let out: unknown;
                    try { out = JSON.parse(stdout); } catch { out = undefined; }
                    const failure = (out as { error?: string } | undefined)?.error;
                    if (error || failure) {
                        reject(new Error(failure || stderr.trim() || String(error)));
                    } else {
                        resolve(out);
                    }
                });
        });
    }

    async startInfo(): Promise<StartInfo> {
        const info = await this.run('ownstudio_lab.start', ['--home', this.home, '--boards', this.boards, '--examples', this.examples]) as StartInfo;
        return { ...info, home: this.home };
    }

    async createSetup(board: string, name: string): Promise<string> {
        // Offline, an existing mirror serves (S4): a failed update is not an error then.
        await this.run('ownstudio_lab.setups', ['mirror', process.env.OWNSTUDIO_CORE_UPSTREAM || CORE_UPSTREAM, this.mirror])
            .catch(e => { if (!fs.existsSync(path.join(this.mirror, 'refs'))) { throw e; } });
        const base = path.join(this.home, 'setups', setupSlug(name));
        let dest = base;
        for (let n = 2; fs.existsSync(dest); n++) {
            dest = `${base}-${n}`;
        }
        const out = await this.run('ownstudio_lab.setups', ['create', this.mirror, dest, board, name, this.boards]) as { setup: string };
        return out.setup;
    }

    async isSetup(folder: string): Promise<boolean> {
        return fs.existsSync(path.join(folder, 'ownstudio', 'setup.yaml'));
    }

    async describeSetup(folder: string): Promise<SetupSummary | undefined> {
        const file = path.join(folder, 'ownstudio', 'setup.yaml');
        if (!fs.existsSync(file)) {
            return undefined;
        }
        const setup = (load(fs.readFileSync(file, 'utf8')) ?? {}) as { name?: string; board?: string };
        const branch = await new Promise<string | null>(resolve =>
            execFile('git', ['-C', folder, 'symbolic-ref', '--quiet', '--short', 'HEAD'], (error, stdout) => resolve(error ? null : stdout.trim())));
        return { name: setup.name ?? path.basename(folder), board: setup.board ?? '', branch };
    }

    protected setupFile(folder: string): string { return path.join(folder, 'ownstudio', 'setup.yaml'); }

    async readCanvas(folder: string): Promise<unknown> {
        const setup = (load(fs.readFileSync(this.setupFile(folder), 'utf8')) ?? {}) as { canvas?: unknown };
        return setup.canvas ?? { nodes: [], wires: [] };
    }

    async writeCanvas(folder: string, canvas: unknown): Promise<void> {
        const file = this.setupFile(folder);
        const setup = (load(fs.readFileSync(file, 'utf8')) ?? {}) as Record<string, unknown>;
        setup.canvas = canvas;
        fs.writeFileSync(file, dump(setup, { sortKeys: false, lineWidth: 120 }));
    }

    async commitEvent(folder: string, event: string, summary: string): Promise<void> {
        await this.run('ownstudio_lab.setups', ['event', folder, event, summary]);
    }

    async boardDefinition(folder: string): Promise<BoardDefinition> {
        const setup = (load(fs.readFileSync(this.setupFile(folder), 'utf8')) ?? {}) as { board?: string };
        if (!setup.board) {
            throw new Error('The setup does not name its board.');
        }
        const description = path.join(this.boards, setup.board, 'board.yaml');
        if (!fs.existsSync(description)) {
            throw new Error(`No board description for ${setup.board}.`);
        }
        return await this.run('ownstudio_lab.board_definition', [description, folder]) as BoardDefinition;
    }

    async openPulsimGui(folder: string): Promise<void> {
        if (!await this.isSetup(folder)) {
            throw new Error('Open an OwnStudio setup before opening PulsimGui.');
        }
        // Fail in the OwnStudio window, with the Python error, rather than
        // claiming success for a detached process that exits during imports.
        await this.run('ownstudio_lab.gui', ['check', folder]);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(this.python, ['-m', 'ownstudio_lab.gui', 'open', folder], {
                detached: true, stdio: 'ignore', env: { ...process.env, PYTHONUNBUFFERED: '1' },
            });
            child.once('error', reject);
            child.once('spawn', () => {
                child.unref();
                resolve();
            });
        });
    }

    async syncPlantValues(folder: string): Promise<PlantSync> {
        const result = await this.run('ownstudio_lab.gui', ['sync', folder]) as PlantSync;
        const names = Object.keys(result.changed);
        const dirty = await new Promise<boolean>((resolve, reject) => {
            execFile('git', ['-C', folder, 'status', '--porcelain', '--', result.plant, 'ownstudio/setup.yaml'],
                (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || String(error))) : resolve(!!stdout.trim()));
        });
        if (dirty) {
            const summary = names.length
                ? `simulation: PulsimGui changed ${names.join(', ')}`
                : `simulation: PulsimGui saved ${path.basename(result.plant)}`;
            await this.commitEvent(folder, 'simulate', summary);
        }
        return result;
    }

    async loadExample(folder: string, example: string): Promise<ExampleLoaded> {
        return await this.run('ownstudio_lab.setups', ['example', folder, this.examples, example]) as ExampleLoaded;
    }
}
