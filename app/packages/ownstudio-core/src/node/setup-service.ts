// SPDX-License-Identifier: LGPL-2.1-only
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { injectable } from '@theia/core/shared/inversify';
import { SetupService, StartInfo, setupSlug } from '../common/setup-protocol';

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
        const out = await this.run('ownstudio_lab.setups', ['create', this.mirror, dest, board, name]) as { setup: string };
        return out.setup;
    }

    async isSetup(folder: string): Promise<boolean> {
        return fs.existsSync(path.join(folder, 'ownstudio', 'setup.yaml'));
    }
}
