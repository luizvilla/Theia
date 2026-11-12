// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { filterArgs, fromSlider, gainsDiffer, loopArgs, toSlider } from './design-sheet';
import { eng, parseEng } from './units';

test('the filter sheet sends the canvas values unless the user is trying others', () => {
    assert.deepEqual(filterArgs({ vOut: 12, stepA: 0.5, rippleMax: 0.1 }), ['--v-out', 12, '--step', 0.5, '--ripple-max', 0.1]);
    assert.deepEqual(filterArgs({ L: 47e-6, vOut: 12, stepA: 0.5, rippleMax: 0.1 }).slice(-2), ['--L', 47e-6]);
});

test('Apply is the only way the loop sheet writes control.cpp', () => {
    assert.deepEqual(loopArgs(undefined, undefined), []);
    assert.deepEqual(loopArgs(0.001, 1e-4), ['--kp', 0.001, '--ti', 1e-4]);
    assert.deepEqual(loopArgs(0.001, 1e-4, true), ['--kp', 0.001, '--ti', 1e-4, '--apply']);
});

test('gains read back from a float file are not a change', () => {
    assert.equal(gainsDiffer({ kp: 0.000215, ti: 7.5175e-5 }, { kp: 0.000215, ti: 7.5175e-5 }), false);
    assert.equal(gainsDiffer({ kp: 0.000215, ti: 7.5175e-5 }, { kp: 0.0002150000001, ti: 7.5175e-5 }), false);
    assert.equal(gainsDiffer({ kp: 0.0003, ti: 7.5175e-5 }, { kp: 0.000215, ti: 7.5175e-5 }), true);
});

test('log sliders round-trip to three significant digits', () => {
    for (const v of [10e-6, 33e-6, 47e-6, 150e-6]) {
        assert.ok(Math.abs(fromSlider(toSlider(v, 10e-6, 150e-6), 10e-6, 150e-6) - v) / v < 0.01);
    }
    assert.equal(toSlider(1, 10e-6, 150e-6), 1000);
});

test('engineering notation both ways', () => {
    assert.equal(eng(33e-6, 'H'), '33 µH');
    assert.equal(eng(30, 'V'), '30 V');
    assert.equal(eng(0.0484, 'V'), '48.4 mV');
    assert.equal(eng(200000, 'Hz'), '200 kHz');
    assert.equal(parseEng('47u'), 47e-6);
    assert.equal(parseEng('47 µH'), 47e-6);
    assert.equal(parseEng('4.7e-5'), 4.7e-5);
    assert.equal(parseEng('abc'), undefined);
});
