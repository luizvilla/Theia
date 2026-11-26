// SPDX-License-Identifier: LGPL-2.1-only
// #51 (ADR 0031 second amendment, Q225–Q228): before Claude Code starts, the AI tab asks
// whether its sandbox can run. On Linux the agent SDK's sandbox needs bubblewrap (bwrap)
// and socat; macOS has its own; Windows has none. On Debian and Ubuntu the Install button
// installs what is missing through the desktop's password dialog (pkexec), no terminal.
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SandboxStatus, SandboxTool } from '../common/sandbox-offer.js';

export interface SandboxProbe {
    platform: NodeJS.Platform;
    has(command: string): boolean;
    osRelease(): string;
}

const TOOLS: { tool: SandboxTool; command: string }[] = [{ tool: 'bubblewrap', command: 'bwrap' }, { tool: 'socat', command: 'socat' }];

function onPath(command: string): boolean {
    const dirs = [...(process.env.PATH ?? '').split(path.delimiter), '/usr/bin', '/usr/sbin', '/bin'];
    return dirs.some(dir => {
        try {
            fs.accessSync(path.join(dir, command), fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    });
}

export const thisMachine: SandboxProbe = {
    platform: process.platform,
    has: onPath,
    osRelease: () => {
        try {
            return fs.readFileSync('/etc/os-release', 'utf8');
        } catch {
            return '';
        }
    },
};

/** The distribution family from /etc/os-release (ID and ID_LIKE). */
function family(osRelease: string): string[] {
    const field = (key: string) => osRelease.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm'))?.[1] ?? '';
    return `${field('ID')} ${field('ID_LIKE')}`.split(/\s+/).filter(Boolean);
}

export function sandboxStatus(probe: SandboxProbe = thisMachine): SandboxStatus {
    if (probe.platform === 'darwin') {
        return { supported: true, missing: [], canInstall: false };
    }
    if (probe.platform !== 'linux') {
        return { supported: false, missing: [], canInstall: false };
    }
    const missing = TOOLS.filter(t => !probe.has(t.command)).map(t => t.tool);
    const ids = family(probe.osRelease());
    const packageManager = ids.some(id => id === 'debian' || id === 'ubuntu') && probe.has('apt-get') ? 'apt'
        : ids.some(id => id === 'fedora' || id === 'rhel') && probe.has('dnf') ? 'dnf' : undefined;
    return { supported: true, missing, packageManager, canInstall: packageManager === 'apt' && probe.has('pkexec') };
}

export type Run = (command: string, args: string[]) => Promise<number>;

const runProcess: Run = (command, args) => new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(-1));
    child.on('exit', code => resolve(code ?? -1));
});

/** pkexec exits 126 when the password dialog is dismissed and 127 when it is not authorised. */
export async function installSandboxTools(missing: SandboxTool[], run: Run = runProcess): Promise<'done' | 'cancelled' | 'failed'> {
    const packages = TOOLS.map(t => t.tool).filter(tool => missing.includes(tool));
    const code = await run('pkexec', ['/usr/bin/apt-get', 'install', '-y', ...packages]);
    return code === 0 ? 'done' : code === 126 || code === 127 ? 'cancelled' : 'failed';
}
