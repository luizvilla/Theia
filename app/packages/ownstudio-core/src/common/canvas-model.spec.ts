// SPDX-License-Identifier: LGPL-2.1-only
// Plan U8: the first topology rules of the setup canvas (SPEC §6, Q82).
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Canvas, addPart, canAdd, canConnect, normaliseCanvas, simulationMissing, withBenchSourceAndLoad } from './canvas-model.js';

const setup = (): Canvas => ({
    nodes: [
        { id: 'board', part: 'twist' },
        { id: 'dc-source', part: 'dc-source' },
        { id: 'resistor', part: 'resistor' },
        { id: 'resistor-2', part: 'resistor' },
    ],
    wires: [],
});
const reason = (v: ReturnType<typeof canConnect>) => (v.ok ? '' : v.reason);

test('source on HIGH and loads on LOW1 and LOW2 are allowed', () => {
    const c = setup();
    assert.ok(canConnect(c, { node: 'dc-source', port: 'out' }, { node: 'board', port: 'HIGH' }).ok);
    assert.ok(canConnect(c, { node: 'board', port: 'LOW1' }, { node: 'resistor', port: 'in' }).ok);
    assert.ok(canConnect(c, { node: 'resistor-2', port: 'in' }, { node: 'board', port: 'LOW2' }).ok);
});

test('source–Twist–source is refused with a reason', () => {
    const c = setup();
    assert.equal(reason(canConnect(c, { node: 'dc-source', port: 'out' }, { node: 'board', port: 'LOW1' })),
        'A source can only connect to HIGH. LOW1 and LOW2 take loads.');
    assert.equal(canAdd(c, 'dc-source').ok, false);
    assert.equal((canAdd(c, 'dc-source') as { reason: string }).reason, 'A setup has one source, on HIGH.');
});

test('load–Twist–load on HIGH is refused with a reason', () => {
    const c = setup();
    assert.equal(reason(canConnect(c, { node: 'resistor', port: 'in' }, { node: 'board', port: 'HIGH' })),
        'A load can only connect to LOW1 or LOW2. HIGH takes the source.');
});

test('parts connect only through the board, once each; HIGH takes one source', () => {
    const c = setup();
    assert.match(reason(canConnect(c, { node: 'dc-source', port: 'out' }, { node: 'resistor', port: 'in' })), /through the board/);
    c.wires.push({ from: { node: 'resistor', port: 'in' }, to: { node: 'board', port: 'LOW1' } });
    assert.match(reason(canConnect(c, { node: 'resistor', port: 'in' }, { node: 'board', port: 'LOW2' })), /already wired/);
    // LOW1 may take a second load (LOW2 may share it: SPEC §6).
    assert.ok(canConnect(c, { node: 'resistor-2', port: 'in' }, { node: 'board', port: 'LOW1' }).ok);
    c.nodes.push({ id: 'dc-source-2', part: 'dc-source' });
    c.wires.push({ from: { node: 'dc-source', port: 'out' }, to: { node: 'board', port: 'HIGH' } });
    assert.match(reason(canConnect(c, { node: 'dc-source-2', port: 'out' }, { node: 'board', port: 'HIGH' })), /already has its source/);
});

test('one board; adding a part gives it an id, a place and its default values', () => {
    const c: Canvas = { nodes: [{ id: 'board', part: 'twist' }], wires: [] };
    assert.equal((canAdd(c, 'twist') as { reason: string }).reason, 'A setup has one board.');
    const r1 = addPart(c, 'resistor', 410.4, 80) as { canvas: Canvas };
    const r2 = addPart(r1.canvas, 'resistor', 410, 200) as { canvas: Canvas };
    assert.deepEqual(r2.canvas.nodes.slice(1), [
        { id: 'resistor', part: 'resistor', x: 410, y: 80, values: { ohm: 33 } },
        { id: 'resistor-2', part: 'resistor', x: 410, y: 200, values: { ohm: 33 } },
    ]);
    assert.deepEqual(addPart(c, 'flux-capacitor', 0, 0), { reason: 'flux-capacitor is not a part OwnStudio knows.' });
});

test('capture and monitor probes survive canvas normalisation', () => {
    const probes = [{ kind: 'capture' as const, label: 'V_LOW1', object: 'rV1Low_V', unit: 'V' }];
    assert.deepEqual(normaliseCanvas({ nodes: [], wires: [], probes }).probes, probes);
});

test('F3: simulation needs a source wired to HIGH and a load wired to LOW1, and says which is missing', () => {
    const twist: Canvas = { nodes: [{ id: 'board', part: 'twist' }], wires: [] };
    assert.equal(simulationMissing(twist), 'Add a source on HIGH and a load on LOW1 to simulate.');
    const placed: Canvas = { ...twist, nodes: [...twist.nodes, { id: 'dc-source', part: 'dc-source' }, { id: 'resistor', part: 'resistor' }] };
    assert.equal(simulationMissing(placed), 'Add a source on HIGH and a load on LOW1 to simulate.', 'placed but not wired');
    const source: Canvas = { ...placed, wires: [{ from: { node: 'dc-source', port: 'out' }, to: { node: 'board', port: 'HIGH' } }] };
    assert.equal(simulationMissing(source), 'Add a load on LOW1 to simulate.');
    const both: Canvas = { ...source, wires: [...source.wires, { from: { node: 'board', port: 'LOW1' }, to: { node: 'resistor', port: 'in' } }] };
    assert.equal(simulationMissing(both), undefined);
});

test('F3: the bench shortcut adds 30 V on HIGH and 33 Ω on LOW1, wiring parts already placed', () => {
    const spot = () => ({ x: 0, y: 0 });
    const fresh = withBenchSourceAndLoad({ nodes: [{ id: 'board', part: 'twist' }], wires: [] }, spot);
    assert.equal(simulationMissing(fresh), undefined);
    assert.deepEqual(fresh.nodes.map(n => [n.part, n.values]), [
        ['twist', undefined], ['dc-source', { voltage: 30, limit: 1 }], ['resistor', { ohm: 33 }]]);

    // A source the user placed and set to 24 V is wired, not replaced; a second run changes nothing.
    const placed: Canvas = { nodes: [{ id: 'board', part: 'twist' }, { id: 'dc-source', part: 'dc-source', values: { voltage: 24 } }], wires: [] };
    const wired = withBenchSourceAndLoad(placed, spot);
    assert.equal(wired.nodes.filter(n => n.part === 'dc-source').length, 1);
    assert.equal(wired.nodes.find(n => n.part === 'dc-source')!.values!.voltage, 24);
    assert.equal(simulationMissing(wired), undefined);
    assert.deepEqual(withBenchSourceAndLoad(wired, spot), wired);
});
