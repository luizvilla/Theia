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
