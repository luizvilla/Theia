// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BuildIdentity, MissionIdentity, BoardInfo, boardName, firmwareState, uploadTarget } from './board-protocol.js';

const build = (hash: string): BuildIdentity => ({ rCommit: 'c'.repeat(40), rDirty: false, rSourceHash: hash });
const mission = (sources: string, prebuilt?: string): MissionIdentity => ({
    sources: { commit: 'c', dirty: false, source_hash: sources },
    prebuilt: prebuilt ? { image: 'i', sha256: 's', build: { commit: 'c', dirty: false, source_hash: prebuilt }, shield: 'twist', shield_version: '1_4_2' } : null,
});

test('firmware state compares source hashes', () => {
    assert.equal(firmwareState(build('aa'), mission('aa', 'aa')), 'matches');
    assert.equal(firmwareState(build('bb'), mission('aa', 'bb')), 'prebuilt');
    assert.equal(firmwareState(build('cc'), mission('aa', 'bb')), 'differs');
    assert.equal(firmwareState(build('unknown'), mission('unknown')), 'unknown');
    assert.equal(firmwareState(null, mission('aa')), 'unknown');
    assert.equal(firmwareState(build('aa'), undefined), 'unknown');
});

test('board names come from the USB product', () => {
    assert.equal(boardName('TWIST_V1_4_2'), 'Twist 1.4.2');
    assert.equal(boardName('OWNVERTER_V1_1_0'), 'Ownverter 1.1.0');
    assert.equal(boardName('MCUBOOT'), 'Spin board (bootloader)');
    assert.equal(boardName('DUT_TWT_1_4_1'), 'Spin board');
});

const plugged = (serial: string, product = 'TWIST_V1_4_2', in_bootloader = false): BoardInfo =>
    ({ serial_number: serial, product, ports: {}, in_bootloader });

test('F18: an upload goes only to the board the setup chose', () => {
    const boards = [plugged('…002E'), plugged('…0031', 'SPIN'), plugged('…0041')];
    assert.deepEqual(uploadTarget(boards, '…002E'), { kind: 'board', serial: '…002E' });
    // the chosen board unplugged: never the other one, even when it is alone
    assert.equal(uploadTarget([plugged('…0041')], '…002E').kind, 'missing');
    assert.match((uploadTarget([plugged('…0041')], '…002E') as { message: string }).message, /…002E\) is not plugged in/);
});

test('F18: no choice yet: one board is used, several ask, none says so', () => {
    assert.deepEqual(uploadTarget([plugged('…002E', 'MCUBOOT', true)], undefined), { kind: 'board', serial: '…002E' });
    assert.deepEqual(uploadTarget([plugged('…002E'), plugged('…0031', 'SPIN')], undefined), { kind: 'choose' });
    assert.equal(uploadTarget([], undefined).kind, 'missing');
});
