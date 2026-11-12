// SPDX-License-Identifier: LGPL-2.1-only
import { spawn, execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { injectable } from '@theia/core/shared/inversify';
import {
    BuildClient, BuildIdentity, BuildPhase, BuildResult, BuildService, SerialCommand
} from '../common/build-protocol';

const exec = promisify(execFile);
const SOURCE_PATHS = ['src', 'platformio.ini', 'zephyr', 'owntech', 'libs'];

interface BuildManifest {
    image: string;
    sha256: string;
    bytes: number;
    build: BuildIdentity;
    shield: string;
    shield_version: string;
}

/** Identity of the inputs PlatformIO sees, independent of generated build files. */
export async function setupBuildIdentity(folder: string): Promise<BuildIdentity> {
    const git = async (args: string[]): Promise<string> => (await exec('git', ['-C', folder, ...args])).stdout.trim();
    const commit = await git(['rev-parse', 'HEAD']);
    const dirty = !!await git(['status', '--porcelain', '--untracked-files=all', '--', ...SOURCE_PATHS]);
    const files = (await git(['ls-files', '-co', '--exclude-standard', '--', ...SOURCE_PATHS])).split('\n').filter(Boolean).sort();
    const hash = createHash('sha256');
    for (const relative of files) {
        const file = path.join(folder, relative);
        const stat = await fs.promises.lstat(file).catch(() => undefined);
        if (!stat?.isFile()) {
            continue;
        }
        hash.update(relative.replaceAll(path.sep, '/'));
        hash.update('\0');
        hash.update(await fs.promises.readFile(file));
        hash.update('\0');
    }
    return { commit, dirty, source_hash: hash.digest('hex').slice(0, 16) };
}

/** Turns the progress formats emitted by mcumgr into exact byte counts. */
export function byteProgress(text: string): { current: number; total: number } | undefined {
    const bytes = /(?:^|\s)(\d+)\s*\/\s*(\d+)\s*(?:bytes?|B)(?:\s|$)/i.exec(text);
    if (bytes) {
        return { current: Number(bytes[1]), total: Number(bytes[2]) };
    }
    const kib = /([\d.]+)\s*KiB\s*\/\s*([\d.]+)\s*KiB/i.exec(text);
    return kib ? { current: Math.round(Number(kib[1]) * 1024), total: Math.round(Number(kib[2]) * 1024) } : undefined;
}

@injectable()
export class BuildServiceImpl implements BuildService {
    protected client: BuildClient | undefined;

    protected get pio(): string { return process.env.OWNSTUDIO_PIO || 'pio'; }
    protected get python(): string { return process.env.OWNSTUDIO_BUILD_PYTHON || process.env.OWNSTUDIO_PYTHON || 'python3'; }

    setClient(client: BuildClient | undefined): void { this.client = client; }

    async identity(folder: string): Promise<BuildIdentity> {
        this.validate(folder);
        return setupBuildIdentity(folder);
    }

    async lastBuild(folder: string): Promise<BuildResult | undefined> {
        this.validate(folder);
        const manifestPath = path.join(folder, '.pio', 'ownstudio', 'manifest.json');
        try {
            const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as BuildManifest;
            const image = path.join(path.dirname(manifestPath), manifest.image);
            if (!fs.existsSync(image)) { return undefined; }
            return { identity: manifest.build, image, manifest: manifestPath, bytes: manifest.bytes, duration_ms: 0 };
        } catch {
            return undefined;
        }
    }

    async build(folder: string): Promise<BuildResult> {
        this.validate(folder);
        const started = Date.now();
        const identity = await setupBuildIdentity(folder);
        const ownBuild = path.join(folder, '.pio', 'ownstudio');
        await fs.promises.mkdir(ownBuild, { recursive: true });
        const header = path.join(ownBuild, 'build_identity.h');
        await fs.promises.writeFile(header, this.header(identity));
        this.emit('build', `> ${this.pio} run`);
        const generated = await this.snapshotGeneratedCoreFiles(folder);
        try {
            await this.run('build', this.pio, ['run'], folder, {
                PLATFORMIO_BUILD_FLAGS: [process.env.PLATFORMIO_BUILD_FLAGS, `-include\"${header}\"`,
                    '-Wl,--undefined=ownstudio_build_identity'].filter(Boolean).join(' '),
            });
        } finally {
            await this.restoreGeneratedCoreFiles(generated);
        }
        const built = await this.findImage(path.join(folder, '.pio', 'build'));
        const image = path.join(ownBuild, 'firmware.mcuboot.bin');
        await fs.promises.copyFile(built, image);
        const data = await fs.promises.readFile(image);
        const manifest: BuildManifest = {
            image: path.basename(image), sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length,
            build: identity, shield: this.setupBoard(folder), shield_version: 'setup',
        };
        const manifestPath = path.join(ownBuild, 'manifest.json');
        await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n');
        const duration = Date.now() - started;
        this.emit('build', `Build ${identity.source_hash} ✓ ${Math.round(duration / 1000)} s`);
        return { identity, image, manifest: manifestPath, bytes: data.length, duration_ms: duration };
    }

    async clean(folder: string): Promise<void> {
        this.validate(folder);
        this.emit('clean', `> ${this.pio} run --target clean`);
        const generated = await this.snapshotGeneratedCoreFiles(folder);
        try {
            await this.run('clean', this.pio, ['run', '--target', 'clean'], folder);
        } finally {
            await this.restoreGeneratedCoreFiles(generated);
        }
        await fs.promises.rm(path.join(folder, '.pio', 'ownstudio'), { recursive: true, force: true });
        this.emit('clean', 'Clean ✓');
    }

    async upload(folder: string): Promise<BuildResult> {
        this.validate(folder);
        const built = await this.lastBuild(folder);
        if (!built) {
            throw new Error('Build the setup before uploading it.');
        }
        const manifestPath = built.manifest;
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as BuildManifest;
        const image = built.image;
        const started = Date.now();
        const args = ['-m', 'ownstudio_lab.flash', manifestPath];
        if (process.env.OWNSTUDIO_MCUMGR) {
            args.push('--mcumgr', process.env.OWNSTUDIO_MCUMGR);
        }
        this.emit('flash', `> ${this.python} -m ownstudio_lab.flash ${manifestPath}`);
        await this.run('flash', this.python, args, folder, { PYTHONUNBUFFERED: '1' });
        const duration = Date.now() - started;
        this.emit('flash', `Flash ${manifest.build.source_hash} ✓ ${Math.round(duration / 1000)} s`, manifest.bytes, manifest.bytes);
        return {
            identity: manifest.build, image, manifest: manifestPath, bytes: manifest.bytes,
            duration_ms: duration,
        };
    }

    async serialCommand(): Promise<SerialCommand> {
        return { command: this.pio, args: ['device', 'monitor'] };
    }

    protected validate(folder: string): void {
        if (!path.isAbsolute(folder) || !fs.existsSync(path.join(folder, 'platformio.ini'))
            || !fs.existsSync(path.join(folder, 'ownstudio', 'setup.yaml'))) {
            throw new Error('Open an OwnStudio setup before using the build tools.');
        }
    }

    protected emit(phase: BuildPhase, text: string, current?: number, total?: number): void {
        this.client?.onBuildEvent({ phase, text, current, total });
    }

    protected run(phase: BuildPhase, command: string, args: string[], cwd: string,
        extraEnv: Record<string, string | undefined> = {}): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
            let tail = '';
            const read = (chunk: Buffer): void => {
                tail += chunk.toString();
                const lines = tail.split(/[\r\n]+/);
                tail = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line) { continue; }
                    const progress = phase === 'flash' ? byteProgress(line) : undefined;
                    const shown = progress ? `Uploading ${progress.current} / ${progress.total} bytes` : line;
                    this.emit(phase, shown, progress?.current, progress?.total);
                }
            };
            child.stdout.on('data', read);
            child.stderr.on('data', read);
            child.on('error', error => reject(new Error(`Cannot start ${command}: ${error.message}`)));
            child.on('close', code => {
                if (tail.trim()) {
                    const line = tail.trim();
                    const progress = phase === 'flash' ? byteProgress(line) : undefined;
                    const shown = progress ? `Uploading ${progress.current} / ${progress.total} bytes` : line;
                    this.emit(phase, shown, progress?.current, progress?.total);
                }
                code === 0 ? resolve() : reject(new Error(`${command} stopped with exit code ${code}.`));
            });
        });
    }

    protected async findImage(root: string): Promise<string> {
        const found: string[] = [];
        const visit = async (folder: string): Promise<void> => {
            for (const entry of await fs.promises.readdir(folder, { withFileTypes: true }).catch(() => [])) {
                const item = path.join(folder, entry.name);
                if (entry.isDirectory()) { await visit(item); }
                else if (entry.isFile() && /(?:firmware\.mcuboot|zephyr\.signed|firmware)\.bin$/.test(entry.name)) { found.push(item); }
            }
        };
        await visit(root);
        const rank = (file: string): number => file.endsWith('firmware.mcuboot.bin') ? 0 : file.endsWith('zephyr.signed.bin') ? 1 : 2;
        found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
        if (!found[0]) {
            throw new Error('PlatformIO finished without producing a firmware image.');
        }
        return found[0];
    }

    protected setupBoard(folder: string): string {
        const text = fs.readFileSync(path.join(folder, 'ownstudio', 'setup.yaml'), 'utf8');
        return /^board:\s*([^\s#]+)/m.exec(text)?.[1] ?? 'unknown';
    }

    protected header(identity: BuildIdentity): string {
        const value = JSON.stringify(identity).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        return `// Generated by OwnStudio. The linker keeps one weak copy in the firmware image.\n` +
            `#pragma once\n#if defined(__GNUC__) && !defined(__ASSEMBLER__)\n#ifdef __cplusplus\nextern \"C\"\n#endif\n` +
            `__attribute__((used, weak, section(\".ownstudio_identity\"))) const char ownstudio_build_identity[] = \"${value}\";\n#endif\n`;
    }

    /**
     * Core's PlatformIO pre-scripts derive these tracked files from app.ini at
     * build time. Put them back only when the result is exactly that mechanical
     * rewrite; an unrelated edit made during the build is never overwritten.
     */
    protected async snapshotGeneratedCoreFiles(folder: string): Promise<Array<{ file: string; before: string }>> {
        const relative = ['zephyr/CMakeLists.txt', 'zephyr/boards/owntech/spin/spin.dts'];
        const found: Array<{ file: string; before: string }> = [];
        for (const name of relative) {
            const file = path.join(folder, name);
            const before = await fs.promises.readFile(file, 'utf8').catch(() => undefined);
            if (before !== undefined) { found.push({ file, before }); }
        }
        return found;
    }

    protected async restoreGeneratedCoreFiles(files: Array<{ file: string; before: string }>): Promise<void> {
        for (const { file, before } of files) {
            const after = await fs.promises.readFile(file, 'utf8').catch(() => undefined);
            if (after === undefined || after === before) { continue; }
            const name = path.basename(file);
            const mechanical = name === 'CMakeLists.txt'
                ? this.withVersions(after, before) === before
                : after === before.replace('zephyr,console = &lpuart1;', 'zephyr,console = &cdc_acm_uart0;');
            if (mechanical) {
                await fs.promises.writeFile(file, before);
            }
        }
    }

    protected withVersions(after: string, before: string): string {
        const line = (text: string, key: string): string | undefined => text.split('\n').find(item => item.trim().startsWith(`set(${key} `));
        let restored = after;
        for (const key of ['BOARD', 'SHIELD']) {
            const old = line(before, key);
            const current = line(restored, key);
            if (old && current) { restored = restored.replace(current, old); }
        }
        return restored;
    }
}
