// SPDX-License-Identifier: LGPL-2.1-only
// #47 (ADR 0031 amendment): the student's one click installs an agent from npm into
// OwnStudio's own folder: no terminal, no npm, nothing global. Each pinned tarball is
// downloaded, checked against its pinned sha512, and unpacked as node_modules/<folder>
// in a staging folder that only becomes the agent's folder once every package is in.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import * as tar from 'tar';
import { AgentId, AgentTarget, PinnedPackage, agentEntry, agentFolder, agentPackages } from '../common/agent-pins.js';

/** Written last: a folder without it is an interrupted install. */
const MARK = '.installed';

/** OwnStudio's agents folder: <OWNSTUDIO_HOME or ~/OwnStudio>/.agents. */
export function agentsDir(env: NodeJS.ProcessEnv = process.env): string {
    return path.join(env.OWNSTUDIO_HOME || path.join(os.homedir(), 'OwnStudio'), '.agents');
}

/** This machine, as the pins name it. Linux without a glibc runtime is musl (the agent SDK's own test). */
export function currentTarget(): AgentTarget {
    const report = process.platform === 'linux' && typeof process.report?.getReport === 'function'
        ? process.report.getReport() as { header?: { glibcVersionRuntime?: string } } : undefined;
    return { platform: process.platform, arch: process.arch, musl: !!report && report.header?.glibcVersionRuntime === undefined };
}

/** The entry's absolute path when the folder holds a complete install, else undefined. */
export function installedAgent(folder: string, entry: string): string | undefined {
    const full = path.join(folder, entry);
    return fs.existsSync(path.join(folder, MARK)) && fs.existsSync(full) ? full : undefined;
}

/** Where this agent's pinned version is installed, if it is. */
export function findAgent(id: AgentId, dir = agentsDir(), target = currentTarget()): string | undefined {
    const entry = agentEntry(id, target);
    return entry ? installedAgent(path.join(dir, agentFolder(id)), entry) : undefined;
}

export type Fetch = (url: string) => Promise<Response>;
export interface InstallProgress { folder: string; index: number; count: number; received: number; total?: number }

/** Installs the agent's pinned packages for this machine; returns the entry Theia is handed. */
export async function installAgent(id: AgentId, options: { dir?: string; target?: AgentTarget; fetch?: Fetch; onProgress?: (p: InstallProgress) => void } = {}): Promise<string> {
    const dir = options.dir ?? agentsDir();
    const target = options.target ?? currentTarget();
    const packages = agentPackages(id, target);
    const entry = agentEntry(id, target);
    if (!packages || !entry) {
        throw new Error(`No ${id} build for ${target.platform}-${target.arch}.`);
    }
    const folder = path.join(dir, agentFolder(id));
    await installPackages(folder, packages, options.fetch ?? (url => fetch(url)), options.onProgress);
    const found = installedAgent(folder, entry);
    if (!found) {
        throw new Error(`The ${id} install finished but ${entry} is missing.`);
    }
    return found;
}

/** Downloads, checks and unpacks every package, then moves the staging folder to dest in one rename. */
export async function installPackages(dest: string, packages: PinnedPackage[], get: Fetch, onProgress?: (p: InstallProgress) => void): Promise<void> {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const staging = `${dest}.partial-${process.pid}-${Date.now()}`;
    try {
        for (const [index, pkg] of packages.entries()) {
            const file = path.join(staging, `${index}.tgz`);
            fs.mkdirSync(staging, { recursive: true });
            await download(pkg, file, get, (received, total) => onProgress?.({ folder: pkg.folder, index, count: packages.length, received, total }));
            const into = path.join(staging, 'node_modules', pkg.folder);
            fs.mkdirSync(into, { recursive: true });
            await tar.x({ file, cwd: into, strip: 1 });
            fs.rmSync(file);
        }
        fs.writeFileSync(path.join(staging, MARK), JSON.stringify({ packages, at: new Date().toISOString() }, undefined, 2));
        fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(staging, dest);
    } catch (e) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw e;
    }
}

async function download(pkg: PinnedPackage, file: string, get: Fetch, progress: (received: number, total?: number) => void): Promise<void> {
    const res = await get(pkg.tarball);
    if (!res.ok || !res.body) {
        throw new Error(`Downloading ${pkg.tarball} failed: HTTP ${res.status}.`);
    }
    const total = Number(res.headers.get('content-length')) || undefined;
    const [algorithm, expected] = [pkg.integrity.slice(0, pkg.integrity.indexOf('-')), pkg.integrity.slice(pkg.integrity.indexOf('-') + 1)];
    const hash = crypto.createHash(algorithm);
    let received = 0;
    const count = new Transform({
        transform(chunk: Buffer, _enc, done): void {
            hash.update(chunk);
            received += chunk.length;
            progress(received, total);
            done(undefined, chunk);
        }
    });
    await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), count, fs.createWriteStream(file));
    const actual = hash.digest('base64');
    if (actual !== expected) {
        throw new Error(`${pkg.tarball} does not match its pinned ${algorithm} (expected ${expected}, got ${actual}).`);
    }
}
