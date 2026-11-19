// SPDX-License-Identifier: LGPL-2.1-only
// Plan U9: board.yaml lays out the five blocks; devicetree values fill the inspector.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BoardDefinition } from './setup-protocol.js';
import { INSIDE_VIEW, insideLayout, insideModel, Rect } from './inside-model.js';

const board = (): BoardDefinition => ({
    name: 'TWIST', version: 'v1.4.2', overlay: 'zephyr/boards/shields/twist/twist_v1_4_2.overlay',
    default_frequency_hz: 200_000, min_frequency_hz: 50_000,
    legs: [
        { name: 'LEG1', pwm_devices: ['pwma', 'pwma'], dead_time_ns: [100, 100], modulation: 'UpDwn', pwm_pins: [12, 14], enabled: true },
        { name: 'LEG2', pwm_devices: ['pwmc', 'pwmc'], dead_time_ns: [100, 100], modulation: 'UpDwn', pwm_pins: [2, 4], enabled: true },
    ],
    sensors: Array.from({ length: 9 }, (_, i) => ({ name: `S${i}`, adc: i % 2 ? 'ADC_2' : 'ADC_1', enabled: true })),
    thresholds: [], port_ratings: {},
    description: {
        board: 'twist', label: 'Twist 1.4.2', controller: 'spin', ports: { HIGH: {}, LOW1: {}, LOW2: {} },
        inside: {
            blocks: {
                power: { label: 'Power', side: 'power', at: [0, 0] },
                measurement: { label: 'Measurement', side: 'control', at: [1, 0] },
                feeder: { label: 'Feeder', side: 'centre', at: [0.5, 0.5] },
                driver: { label: 'Driver', side: 'power', at: [0, 1] },
                controller: { label: 'Controller', side: 'control', at: [1, 1] },
            },
            signals: [['power', 'measurement', 'sensor signals'], ['measurement', 'controller', 'measurements'],
                ['controller', 'driver', 'PWM'], ['driver', 'power', 'gates']],
            ports_on: 'power', isolation: true,
        },
    },
});

test('board.yaml places the five named blocks and the clockwise signal loop', () => {
    const model = insideModel(board());
    assert.deepEqual(model.blocks.map(block => [block.id, block.label, block.at]), [
        ['power', 'Power', [0, 0]], ['measurement', 'Measurement', [1, 0]], ['feeder', 'Feeder', [0.5, 0.5]],
        ['driver', 'Driver', [0, 1]], ['controller', 'Controller', [1, 1]],
    ]);
    assert.deepEqual(model.signals.map(signal => signal[2]), ['sensor signals', 'measurements', 'PWM', 'gates']);
    assert.deepEqual(model.ports, ['HIGH', 'LOW1', 'LOW2']);
    assert.equal(model.isolation, true);
});

test('the driver inspector reads frequency and dead time from the devicetree definition', () => {
    const driver = insideModel(board()).blocks.find(block => block.id === 'driver')!;
    assert.deepEqual(driver.details, [
        ['Function', 'gate drivers, both legs'], ['Timer', 'HRTIM'], ['Switching frequency', '200 kHz'],
        ['Dead time', '100 ns / 100 ns'], ['Modulation', 'up-down'], ['Set in', 'setup() · main.cpp:42'],
        ['Source', 'twist_v1_4_2.overlay'],
    ]);
});

test('an incomplete or dangling board description is refused', () => {
    const missing = board();
    delete missing.description.inside.blocks.driver;
    assert.throws(() => insideModel(missing), /no driver block/);
    const dangling = board();
    dangling.description.inside.signals.push(['power', 'unknown', 'bad']);
    assert.throws(() => insideModel(dangling), /unknown block/);
});

// F10 (Q182): "the lines do not align". On the fixed grid every arrow runs straight along the grid
// and starts and ends on a block's edge, and nothing leaves the view.
const onEdge = ([x, y]: [number, number], r: Rect): boolean =>
    ((x === r.x || x === r.x + r.width) && y >= r.y && y <= r.y + r.height)
    || ((y === r.y || y === r.y + r.height) && x >= r.x && x <= r.x + r.width);

test('every arrow of the inside view runs from one block edge to another, along the grid', () => {
    const layout = insideLayout(insideModel(board()));
    const rect = (id: string) => layout.blocks.find(b => b.id === id)!;
    assert.equal(layout.signals.length, 4);
    assert.equal(layout.energy.length, 4);
    for (const arrow of [...layout.signals, ...layout.energy]) {
        const name = `${arrow.from} → ${arrow.to}`;
        assert.ok(onEdge(arrow.points[0], rect(arrow.from)), `${name} starts on ${arrow.from}'s edge: ${JSON.stringify(arrow.points[0])}`);
        assert.ok(onEdge(arrow.points.at(-1)!, rect(arrow.to)), `${name} ends on ${arrow.to}'s edge: ${JSON.stringify(arrow.points.at(-1))}`);
        for (let i = 1; i < arrow.points.length; i++) {
            const [[x0, y0], [x1, y1]] = [arrow.points[i - 1], arrow.points[i]];
            assert.ok(x0 === x1 || y0 === y1, `${name} has a slanted segment`);
        }
    }
});

test('the inside view keeps its blocks apart and inside the view, and its signals clear of the feeder lines', () => {
    const layout = insideLayout(insideModel(board()));
    for (const a of layout.blocks) {
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= INSIDE_VIEW.width && a.y + a.height <= INSIDE_VIEW.height, `${a.id} is outside the view`);
        for (const b of layout.blocks.filter(other => other.id !== a.id)) {
            const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
            assert.ok(apart, `${a.id} overlaps ${b.id}`);
        }
    }
    const signalXs = layout.signals.flatMap(s => s.points[0][0] === s.points[1][0] ? [s.points[0][0]] : []);
    const energyXs = layout.energy.map(e => e.points[1][0]);
    assert.ok(energyXs.every(x => signalXs.every(sx => Math.abs(x - sx) >= 20)), `feeder lines ${energyXs} run on a signal ${signalXs}`);
    assert.deepEqual(layout.barrier?.[0], INSIDE_VIEW.width / 2);
});
