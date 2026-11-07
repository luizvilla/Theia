// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BoardPackError, parseBoardPack, revisionOf } from './board-pack';

// From lib/common back to the package, then to the app's bundled packs.
const TWIST = path.resolve(__dirname, '../../../../applications/electron/boardpacks/twist/board.yaml');

test('the bundled Twist pack is valid', () => {
    const pack = parseBoardPack(fs.readFileSync(TWIST, 'utf8'));
    assert.equal(pack.board, 'twist');
    assert.deepEqual(Object.keys(pack.ports), ['HIGH', 'LOW1', 'LOW2']);
    assert.equal(pack.ports.HIGH.v_max_V.value, 100);
    assert.equal(pack.blocks.driver.isolated, true);
    assert.ok(pack.chains.some(c => c.id === 'fw-v-high' && c.threshold.value === 100));
    assert.equal(revisionOf(pack, 'TWIST_V1_4_2'), '1.4.2');
    assert.equal(revisionOf(pack, 'MCUBOOT'), undefined);
});

const minimal = (patch: string) => `
format: 1
board: b
title: B
revisions: [{version: "1", usb_product: B_V1}]
ports:
  P: {side: high, kinds: [DC], v_min_V: {value: 1, source: s}, v_max_V: {value: 10, source: s},
      v_abs_max_V: {value: 12, source: s}, i_max_A: {value: 1, source: s}}
blocks:
  measurement: {isolated: true, parts: x, source: s}
  driver: {isolated: false, parts: x, source: s}
  aps: {isolated: false, parts: x, source: s}
protection_chains:
${patch}
`;

test('a minimal pack parses', () => {
    const pack = parseBoardPack(minimal('  - {id: f, kind: passive, ports: [P], quantity: current, trips_above_A: {value: 1, source: s}}'));
    assert.equal(pack.chains[0].threshold.value, 1);
    assert.equal(pack.chains[0].quantity, 'current');
});

test('every problem is reported', () => {
    const text = minimal('  - {id: f, kind: magic, ports: [Q], quantity: current, trips_above_V: {value: 1}}')
        .replace('v_max_V: {value: 10, source: s}', 'v_max_V: {value: 20}');
    assert.throws(() => parseBoardPack(text), (err: BoardPackError) => {
        const all = err.problems.join('\n');
        assert.match(all, /v_max_V: every value needs a source/);
        assert.match(all, /above its absolute maximum/);
        assert.match(all, /kind must be passive or firmware/);
        assert.match(all, /unknown port Q/);
        assert.match(all, /trips_above_A: expected \{value, source\}/);
        return true;
    });
});

test('a value without a number is refused', () => {
    assert.throws(() => parseBoardPack(minimal('  []').replace('i_max_A: {value: 1, source: s}', 'i_max_A: {value: lots, source: s}')),
        /i_max_A: must be a number/);
});
