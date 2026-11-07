// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BuildIdentity, MissionIdentity, boardName, firmwareState } from './board-protocol';

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
