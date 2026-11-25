// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import { PinnedPackage } from '../common/agent-pins.js';
import { agentsDir, installedAgent, installPackages } from './agent-installer.js';

/** An npm-style tarball (everything under package/) and its sha512 integrity. */
async function tarball(root: string, name: string, files: Record<string, string>): Promise<{ bytes: Buffer; integrity: string }> {
    const src = path.join(root, `src-${name}`, 'package');
    for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(src, file)), { recursive: true });
        fs.writeFileSync(path.join(src, file), text, { mode: file.endsWith('codex') ? 0o755 : 0o644 });
    }
    const out = path.join(root, `${name}.tgz`);
    await tar.c({ gzip: true, file: out, cwd: path.dirname(src) }, ['package']);
    const bytes = fs.readFileSync(out);
    return { bytes, integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` };
}

function withTemp(fn: (root: string) => Promise<void>): () => Promise<void> {
    return async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-agents-'));
        try {
            await fn(root);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

test('#47: the agents live in OwnStudio\'s own folder, never a global one', () => {
    assert.equal(agentsDir({ OWNSTUDIO_HOME: '/x/home' }), path.join('/x/home', '.agents'));
    assert.equal(agentsDir({}), path.join(os.homedir(), 'OwnStudio', '.agents'));
});

test('#47: install unpacks each pinned tarball into node_modules, then the agent counts as installed', withTemp(async root => {
    const sdk = await tarball(root, 'sdk', { 'sdk.mjs': 'export {}', 'package.json': '{}' });
    const native = await tarball(root, 'native', { 'vendor/t/bin/codex': '#!/bin/sh\n' });
    const urls: string[] = [];
    const packages: PinnedPackage[] = [
        { folder: '@v/sdk', tarball: 'https://registry.npmjs.org/sdk.tgz', integrity: sdk.integrity },
        { folder: '@v/sdk-native', tarball: 'https://registry.npmjs.org/native.tgz', integrity: native.integrity },
    ];
    const fetch = async (url: string) => { urls.push(url); return new Response(url.endsWith('sdk.tgz') ? sdk.bytes : native.bytes); };
    const dest = path.join(root, 'agents', 'claude-1');
    await installPackages(dest, packages, fetch);
    assert.deepEqual(urls, packages.map(p => p.tarball));
    assert.ok(fs.existsSync(path.join(dest, 'node_modules', '@v', 'sdk', 'sdk.mjs')));
    const bin = path.join(dest, 'node_modules', '@v', 'sdk-native', 'vendor', 't', 'bin', 'codex');
    assert.ok(fs.existsSync(bin));
    if (process.platform !== 'win32') {
        assert.ok(fs.statSync(bin).mode & 0o100, 'the binary stays executable');
    }
    assert.equal(installedAgent(dest, 'node_modules/@v/sdk'), path.join(dest, 'node_modules', '@v', 'sdk'));
}));

test('#47: a tarball that does not match its pinned sha512 installs nothing', withTemp(async root => {
    const good = await tarball(root, 'good', { 'sdk.mjs': 'export {}' });
    const bad = await tarball(root, 'bad', { 'sdk.mjs': 'export const evil = 1' });
    const dest = path.join(root, 'agents', 'claude-1');
    await assert.rejects(
        installPackages(dest, [{ folder: 'sdk', tarball: 'https://registry.npmjs.org/sdk.tgz', integrity: good.integrity }],
            async () => new Response(bad.bytes)),
        /does not match/);
    assert.equal(installedAgent(dest, 'node_modules/sdk'), undefined);
    assert.deepEqual(fs.readdirSync(path.join(root, 'agents')), [], 'no half-installed folder is left');
}));

test('#47: a failed download installs nothing', withTemp(async root => {
    const dest = path.join(root, 'agents', 'codex-1');
    await assert.rejects(
        installPackages(dest, [{ folder: 'x', tarball: 'https://registry.npmjs.org/x.tgz', integrity: 'sha512-AA==' }],
            async () => new Response('gone', { status: 404 })),
        /404/);
    assert.equal(installedAgent(dest, 'node_modules/x'), undefined);
}));

test('#47: an interrupted install (no completion mark) does not count as installed', withTemp(async root => {
    const dest = path.join(root, 'claude-1');
    fs.mkdirSync(path.join(dest, 'node_modules', 'sdk'), { recursive: true });
    assert.equal(installedAgent(dest, 'node_modules/sdk'), undefined);
}));

test('#47: progress reports bytes as they arrive', withTemp(async root => {
    const one = await tarball(root, 'one', { 'a.txt': 'x'.repeat(10_000) });
    const seen: number[] = [];
    await installPackages(path.join(root, 'agents', 'a-1'),
        [{ folder: 'a', tarball: 'https://registry.npmjs.org/a.tgz', integrity: one.integrity }],
        async () => new Response(one.bytes, { headers: { 'content-length': String(one.bytes.length) } }),
        p => seen.push(p.received));
    assert.ok(seen.length > 0 && seen[seen.length - 1] === one.bytes.length);
}));
