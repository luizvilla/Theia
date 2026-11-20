// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addBundledToolsToPath } from './bundled-tools.js';
import { codeToolsStale, writeClangdConfig } from './build-service.js';

test('F5: shipped tools and the ARM toolchain go on PATH, once, before what was there', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-tools-'));
    fs.mkdirSync(path.join(root, 'tools', 'clangd', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'pio', 'packages', 'toolchain-gccarmnoneeabi', 'bin'), { recursive: true });
    const before = process.env.OWNSTUDIO_TOOLS;
    process.env.OWNSTUDIO_TOOLS = path.join(root, 'tools');
    try {
        const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', PLATFORMIO_CORE_DIR: path.join(root, 'pio') };
        const added = addBundledToolsToPath(env);
        assert.deepEqual(added, [path.join(root, 'tools', 'clangd', 'bin'), path.join(root, 'pio', 'packages', 'toolchain-gccarmnoneeabi', 'bin')]);
        assert.equal(env.PATH, [...added, '/usr/bin'].join(path.delimiter));
        assert.deepEqual(addBundledToolsToPath(env), [], 'a second call adds nothing');
    } finally {
        process.env.OWNSTUDIO_TOOLS = before;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('F5: the compile database is stale when missing or older than a flag input, not after a code edit', () => {
    const setup = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-db-'));
    try {
        fs.mkdirSync(path.join(setup, 'src'));
        fs.writeFileSync(path.join(setup, 'platformio.ini'), '[env]\n');
        assert.equal(codeToolsStale(setup), true, 'missing');
        const database = path.join(setup, 'compile_commands.json');
        fs.writeFileSync(database, '[]');
        const now = Date.now() / 1000;
        fs.utimesSync(path.join(setup, 'platformio.ini'), now - 100, now - 100);
        fs.utimesSync(database, now - 50, now - 50);
        fs.writeFileSync(path.join(setup, 'src', 'control.cpp'), '// edited');
        assert.equal(codeToolsStale(setup), false, 'a code edit does not change the flags');
        fs.writeFileSync(path.join(setup, 'src', 'app.conf'), 'CONFIG_X=y\n');
        assert.equal(codeToolsStale(setup), true, 'app.conf changed after the database');
    } finally {
        fs.rmSync(setup, { recursive: true, force: true });
    }
});

test('F19: no red marks before the compile database exists; a user\'s own .clangd is left alone', async () => {
    const setup = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-clangd-'));
    try {
        fs.mkdirSync(path.join(setup, '.git', 'info'), { recursive: true });
        const config = path.join(setup, '.clangd');
        await writeClangdConfig(setup);
        assert.match(fs.readFileSync(config, 'utf8'), /Suppress: '\*'/, 'no database: diagnostics wait');
        fs.writeFileSync(path.join(setup, 'compile_commands.json'), '[]');
        await writeClangdConfig(setup);
        const ready = fs.readFileSync(config, 'utf8');
        assert.doesNotMatch(ready, /Suppress/, 'database ready: diagnostics shown');
        assert.match(ready, /CommentFormat: Doxygen/);
        fs.writeFileSync(config, 'Diagnostics:\n  UnusedIncludes: None\n');
        fs.rmSync(path.join(setup, 'compile_commands.json'));
        await writeClangdConfig(setup);
        assert.equal(fs.readFileSync(config, 'utf8'), 'Diagnostics:\n  UnusedIncludes: None\n');
    } finally {
        fs.rmSync(setup, { recursive: true, force: true });
    }
});
