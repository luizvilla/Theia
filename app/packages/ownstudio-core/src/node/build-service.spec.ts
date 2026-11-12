// SPDX-License-Identifier: LGPL-2.1-only
// Plan U10: a fake PlatformIO build and a fake mcumgr upload both stream progress.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildClient, BuildEvent } from '../common/build-protocol.js';
import { BuildServiceImpl, byteProgress, setupBuildIdentity } from './build-service.js';

class TestBuildService extends BuildServiceImpl {
    constructor(protected readonly fakePio: string, protected readonly fakePython: string) { super(); }
    protected override get pio(): string { return this.fakePio; }
    protected override get python(): string { return this.fakePython; }
}

function executable(folder: string, name: string, source: string): string {
    const file = path.join(folder, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${source}`);
    fs.chmodSync(file, 0o755);
    return file;
}

function fixture(): { folder: string; pio: string; python: string } {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-build-'));
    fs.mkdirSync(path.join(folder, 'src'));
    fs.mkdirSync(path.join(folder, 'ownstudio'));
    fs.mkdirSync(path.join(folder, 'zephyr'));
    fs.writeFileSync(path.join(folder, 'platformio.ini'), '[platformio]\ndefault_envs = USB\n');
    fs.writeFileSync(path.join(folder, 'src', 'main.cpp'), 'void setup() {}\n');
    fs.writeFileSync(path.join(folder, 'ownstudio', 'setup.yaml'), 'name: Fake\nboard: twist\n');
    fs.writeFileSync(path.join(folder, 'zephyr', 'CMakeLists.txt'), 'set(BOARD spin@1_2_0)\nset(SHIELD twist_v1_4_1)\n');
    execFileSync('git', ['init', '-q', folder]);
    execFileSync('git', ['-C', folder, 'add', '.']);
    execFileSync('git', ['-C', folder, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture']);
    const pio = executable(folder, 'fake-pio.cjs', `
const fs = require('fs');
if (process.argv.includes('clean')) { fs.rmSync('.pio/build', { recursive: true, force: true }); console.log('Removed build'); }
else { console.log('Processing USB'); console.log('Compiling src/main.cpp.o'); console.log('Linking firmware.elf');
  const cmake = fs.readFileSync('zephyr/CMakeLists.txt', 'utf8'); fs.writeFileSync('zephyr/CMakeLists.txt', cmake.replace('twist_v1_4_1', 'twist_v1_4_2'));
  fs.mkdirSync('.pio/build/USB', { recursive: true }); fs.writeFileSync('.pio/build/USB/firmware.mcuboot.bin', Buffer.alloc(64, 7)); }
`);
    const python = executable(folder, 'fake-python.cjs', `
console.log('Board FAKE (MCUBOOT)');
console.log('Uploading 32 / 64 bytes');
console.log('Uploading 64 / 64 bytes');
console.log('Done: board FAKE runs TWIST_V1_4_2');
`);
    return { folder, pio, python };
}

test('byte progress accepts mcumgr byte and KiB formats', () => {
    assert.deepEqual(byteProgress('Uploading 32 / 64 bytes'), { current: 32, total: 64 });
    assert.deepEqual(byteProgress('1.5 KiB / 2.0 KiB'), { current: 1536, total: 2048 });
    assert.equal(byteProgress('Restarting the board'), undefined);
});

test('a fake build and flash stream progress and carry a stable source identity', async () => {
    const { folder, pio, python } = fixture();
    const service = new TestBuildService(pio, python);
    const events: BuildEvent[] = [];
    service.setClient({ onBuildEvent: event => events.push(event) } satisfies BuildClient);

    const before = await setupBuildIdentity(folder);
    const built = await service.build(folder);
    assert.equal(built.bytes, 64);
    assert.equal(built.identity.source_hash, before.source_hash);
    assert.equal(built.identity.dirty, false);
    assert.ok(fs.existsSync(built.manifest));
    assert.equal((await service.lastBuild(folder))?.identity.source_hash, built.identity.source_hash);
    assert.ok(events.some(event => event.phase === 'build' && event.text.includes('Compiling')));
    assert.match(fs.readFileSync(path.join(folder, 'zephyr', 'CMakeLists.txt'), 'utf8'), /twist_v1_4_1/);
    assert.equal(execFileSync('git', ['-C', folder, 'status', '--porcelain', '--untracked-files=no']).toString(), '');

    const flashed = await service.upload(folder);
    assert.equal(flashed.identity.source_hash, built.identity.source_hash);
    assert.deepEqual(events.filter(event => event.phase === 'flash' && event.current !== undefined)
        .map(event => [event.current, event.total]), [[32, 64], [64, 64], [64, 64]]);

    fs.appendFileSync(path.join(folder, 'src', 'main.cpp'), '// edit\n');
    const edited = await setupBuildIdentity(folder);
    assert.equal(edited.dirty, true);
    assert.notEqual(edited.source_hash, before.source_hash);

    await service.clean(folder);
    assert.equal(await service.lastBuild(folder), undefined);
    assert.equal(fs.existsSync(path.join(folder, '.pio', 'ownstudio')), false);
});

test('the forced header gives the firmware its identity macros for ThingSet (E21, U11)', async () => {
    const { buildIdentityHeader } = await import('./build-service.js');
    const header = buildIdentityHeader({ commit: 'c2f17421be7dfa4ac2f17421be7dfa4ac2f17421', dirty: false, source_hash: 'c2f17421be7dfa4a' });
    assert.match(header, /#define BUILD_COMMIT "c2f17421be7dfa4ac2f17421be7dfa4ac2f17421"/);
    assert.match(header, /#define BUILD_DIRTY false/);
    assert.match(header, /#define BUILD_SOURCE_HASH "c2f17421be7dfa4a"/);
    assert.match(header, /ownstudio_build_identity\[\] = "\{\\"commit\\":/);
});
