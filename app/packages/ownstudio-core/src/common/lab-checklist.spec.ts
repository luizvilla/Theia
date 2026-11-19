// SPDX-License-Identifier: LGPL-2.1-only
import * as assert from 'assert';
import { test } from 'node:test';
import { Canvas } from './canvas-model.js';
import { LabChecklistInput, labChecklist } from './lab-checklist.js';

const canvas: Canvas = {
    nodes: [
        { id: 'source', part: 'dc-source', values: { voltage: 30, limit: 1 } },
        { id: 'board', part: 'twist' },
        { id: 'load', part: 'resistor', values: { ohm: 33 } },
    ],
    wires: [
        { from: { node: 'source', port: 'out' }, to: { node: 'board', port: 'HIGH' } },
        { from: { node: 'board', port: 'LOW1' }, to: { node: 'load', port: 'in' } },
    ],
};

const ready = (overrides: Partial<LabChecklistInput> = {}): LabChecklistInput => ({
    canvas, boardProduct: 'TWIST_V1_4_2', firmware: 'matches', firmwareHash: '584efeb00', highVoltage: 29.9,
    outputs: { LOW1: { voltage: 0, current: 0, voltageMax: 70, currentMax: 7 } },
    procedure: { title: 'Capture', valid: true }, ...overrides,
});

test('all six Lab checks hold for the intended Twist bench', () => {
    const checks = labChecklist(ready());
    assert.equal(checks.length, 6);
    assert.ok(checks.every(check => check.ok), checks.map(check => check.sentence).join('\n'));
});

test('a bare Spin turns Run red with its sentence', () => {
    const check = labChecklist(ready({ boardProduct: 'SPIN_V1' }))[0];
    assert.equal(check.ok, false);
    assert.equal(check.sentence, 'A bare Spin is connected; the canvas needs Twist 1.4.2.');
});

test('a dead HIGH turns Run red and tells the user to switch the supply on', () => {
    const check = labChecklist(ready({ highVoltage: 0.2 }))[2];
    assert.equal(check.ok, false);
    assert.equal(check.sentence, 'HIGH is 0.2 V; the canvas says 30 V. Switch the supply on.');
});

test('a 20 percent HIGH mismatch turns Run red with the tolerance', () => {
    const check = labChecklist(ready({ highVoltage: 24 }))[2];
    assert.equal(check.ok, false);
    assert.match(check.sentence, /20 % low; it must be within 10 %/);
});

test('an output cannot be called inside limits without all live measurements', () => {
    const check = labChecklist(ready({ outputs: { LOW1: { voltage: 0, voltageMax: 70, currentMax: 7 } } }))[3];
    assert.equal(check.ok, false);
    assert.match(check.sentence, /LOW1 has no live current reading/);
});

test('F6: the firmware line names both builds and offers the one action that fixes it', async () => {
    const { firmwareCheck } = await import('./lab-checklist.js');
    const base = { canvas: { nodes: [], wires: [] }, outputs: {}, boardProduct: 'TWIST_V1_4_2' };
    const unplugged = firmwareCheck({ canvas: { nodes: [], wires: [] }, outputs: {}, firmware: 'unknown', latestBuildHash: '8a0a099bc5c20324' });
    assert.equal(unplugged.sentence, 'Connect the board to read its firmware.');
    assert.equal(unplugged.action, undefined);
    // Luiz's trial: the board ran d4c7, the code was built as 8a0a and not uploaded.
    const trial = firmwareCheck({ ...base, firmware: 'differs', firmwareHash: 'd4c7e553b9c495a1',
        latestBuildHash: '8a0a099bc5c20324', sourcesHash: '8a0a099bc5c20324' });
    assert.equal(trial.sentence, 'The board runs build d4c7e553; your code is build 8a0a099b, built and not uploaded.');
    assert.equal(trial.action, 'upload');
    const edited = firmwareCheck({ ...base, firmware: 'differs', firmwareHash: 'd4c7e553b9c495a1',
        latestBuildHash: '8a0a099bc5c20324', sourcesHash: 'ffff0000ffff0000' });
    assert.equal(edited.sentence, 'The board runs build d4c7e553; your code changed since build 8a0a099b.');
    assert.equal(edited.action, 'build-upload');
    const stale = firmwareCheck({ ...base, firmware: 'prebuilt', firmwareHash: '8a0a099bc5c20324',
        latestBuildHash: '8a0a099bc5c20324', sourcesHash: 'ffff0000ffff0000' });
    assert.equal(stale.sentence, 'The board runs build 8a0a099b, your latest build; your code changed since.');
    assert.equal(stale.action, 'build-upload');
    const never = firmwareCheck({ ...base, firmware: 'differs', firmwareHash: 'd4c7e553b9c495a1', sourcesHash: 'ffff0000ffff0000' });
    assert.equal(never.sentence, 'The board runs build d4c7e553; this setup has not been built yet.');
    const ok = firmwareCheck({ ...base, firmware: 'matches', firmwareHash: '8a0a099bc5c20324' });
    assert.equal(ok.ok, true);
    assert.equal(ok.action, undefined);
});
