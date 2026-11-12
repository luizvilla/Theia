// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TestRecord, bands, clip, compareCases, tolerance, twinPath } from './overlay.js';

const board: TestRecord = {
    procedure: 'BUCK-REF-01', target: 'board', verdict: 'PASS', twin: 'buck-ref-01-simulator',
    conditions: { v_high_V: 29.4, load_ohm: 33 },
    cases: [
        { id: 'A', title: 'Steady at 10 V', measured: 9.9, expected: 10, unit: 'V', criterion: 'within 2%', passed: true, window_s: [-0.02, 0] },
        { id: 'B', title: 'Steady at 12 V', measured: 11.9, expected: 12, unit: 'V', criterion: 'within 2 %', passed: true, window_s: [0, 1] },
        { id: 'C', title: 'Settling', measured: 28.7, unit: 'ms', criterion: 'information only', verdict: 'INFO' },
    ],
};
const sim: TestRecord = {
    procedure: 'BUCK-REF-01', target: 'simulator', verdict: 'PASS', twin: 'buck-ref-01-board',
    cases: [
        { id: 'A', title: 'Steady at 10 V', measured: 10.0, expected: 10, unit: 'V', criterion: 'within 2%', passed: true },
        { id: 'C', title: 'Settling', measured: 24.6, unit: 'ms', criterion: 'information only', verdict: 'INFO' },
    ],
};

test('reads the tolerance of a criterion', () => {
    assert.deepEqual(tolerance('within 2%'), { kind: 'within', fraction: 0.02 });
    assert.deepEqual(tolerance('at least 95 % of 12 V'), { kind: 'at-least', fraction: 0.95 });
    assert.equal(tolerance('information only'), undefined);
});

test('a band per voltage case, over its own window, clipped to the plot', () => {
    const b = bands(board.cases, -0.02, 0.08);
    assert.equal(b.length, 2);
    assert.deepEqual([b[0].low, b[0].high, b[0].t0, b[0].t1], [9.8, 10.2, -0.02, 0]);
    assert.deepEqual([b[1].t0, b[1].t1], [0, 0.08]);
});

test('compares each board case with the same case of its simulation', () => {
    const rows = compareCases(board, sim);
    assert.equal(rows.length, 3);
    assert.ok(Math.abs(rows[0].difference! - -0.1) < 1e-9);
    assert.equal(rows[1].simulation, undefined);              // not in the simulation record
    assert.equal(rows[2].boardVerdict, 'INFO');
    assert.ok(Math.abs(rows[2].difference! - 4.1) < 1e-9);
});

test('a case that could not be measured shows its reason', () => {
    const rows = compareCases({ ...board, cases: [{ id: 'C', title: 'Settling', verdict: 'INFO', reason: 'not settled' }] }, sim);
    assert.equal(rows[0].board, 'not settled');
    assert.equal(rows[0].difference, undefined);
});

test('clips a waveform to the board window', () => {
    assert.deepEqual(clip({ t: [-1, 0, 1, 2], v: [1, 2, 3, 4] }, 0, 1), { t: [0, 1], v: [2, 3] });
});

test('the twin lives next to the record, in the same campaign', () => {
    assert.equal(twinPath('/m/records/2026-11-07_abc_1200/buck-ref-01-board', 'buck-ref-01-simulator'),
        '/m/records/2026-11-07_abc_1200/buck-ref-01-simulator');
});
