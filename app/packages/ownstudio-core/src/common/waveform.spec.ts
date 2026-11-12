// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { eventWindow, parseWaveform } from './waveform';

test('reads the first two columns and decimates', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `${i * 1e-6},${12 + i},0.5`);
    const w = parseWaveform(['t_s,v_low1_V,i_l_A', ...rows].join('\n'), 5);
    assert.deepEqual(w.v, [12, 14, 16, 18, 20]);
    assert.equal(w.t[1], 2e-6);
    assert.deepEqual(w.series?.map(s => [s.name, s.values[1]]), [['v_low1_V', 14], ['i_l_A', 0.5]]);
});

test('opens around the event and keeps a one-click whole-run range', () => {
    assert.deepEqual(eventWindow([-0.02, 0, 0.08]), [-0.005, 0.04]);
    assert.deepEqual(eventWindow([1, 2, 3]), [1, 3]);
});

test('skips lines that are not numbers', () => {
    assert.deepEqual(parseWaveform('t,v\n1,2\nx,y\n3,4').v, [2, 4]);
});
