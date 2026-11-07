// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { panelPaths, parsePanel, splitPath } from './panel-format';
import { parseDataObjects, parseInput } from './data-objects';

const data = (name: string) => fs.readFileSync(path.resolve(__dirname, 'testdata', name), 'utf8');

test('the buck panel maps onto OwnStudio widgets', () => {
    const panel = parsePanel(data('buck.panel.json'));
    const kinds = panel.panes.flatMap(p => p.widgets.map(w => w.kind));
    assert.deepEqual(kinds, ['gauge', 'number', 'setpoint', 'toggle', 'number', 'gauge', 'number', 'plot']);
    const setpoint = panel.panes[1].widgets[0];
    assert.equal(setpoint.kind === 'setpoint' && setpoint.writePath, 'Converter/wVoltageRef_V');
    const needle = panel.panes[2].widgets[0];
    assert.equal(needle.kind === 'gauge' && needle.critical, 60);
});

test('every path the buck panel reads is a declared data object', () => {
    const declared = new Set(parseDataObjects(data('data_objects.yaml')).map(o => o.path));
    for (const p of panelPaths(parsePanel(data('buck.panel.json')))) {
        assert.ok(declared.has(p), p);
    }
});

test('serial-port widgets and other types are kept as unsupported, with a reason', () => {
    const panel = parsePanel(JSON.stringify({
        datasources: [{ name: 'S', type: 'serialport_datasource' }],
        panes: [{ title: 'x', widgets: [
            { type: 'radial_arc_gauge', settings: { title: 'VH', sourceDef: { ds: 'S', type: 'serialport_datasource', var: 7 } } },
            { type: 'serial_terminal', settings: { title: 'T' } },
            { type: 'toggle_button', settings: { title: 'P', onCommand: 'ON' } },
        ] }],
    }));
    assert.deepEqual(panel.panes[0].widgets.map(w => w.kind), ['unsupported', 'unsupported', 'unsupported']);
    assert.match(JSON.stringify(panel), /needs a ThingSet source/);
});

test('a datasource named only in the datasources list counts', () => {
    const panel = parsePanel(JSON.stringify({
        datasources: [{ name: 'T', type: 'owntech_thingset_datasource' }],
        panes: [{ title: 'x', widgets: [{ type: 'text_widget', settings: { title: 'D', sourceDef: { ds: 'T', var: '/Measurements/rDuty' } } }] }],
    }));
    assert.equal(panel.panes[0].widgets[0].kind, 'number');
});

test('paths split into group and name', () => {
    assert.deepEqual(splitPath('Converter/Mode'), ['Converter', 'Mode']);
    assert.deepEqual(splitPath('pNodeID'), ['', 'pNodeID']);
});

test('the data object table reads the mission file and checks typed values', () => {
    const objects = parseDataObjects(data('data_objects.yaml'));
    const mode = objects.find(o => o.path === 'Converter/Mode')!;
    assert.equal(mode.writable, true);
    assert.equal(objects.find(o => o.path === 'Measurements/rDuty')!.writable, false);
    assert.equal(parseInput('float', '11.5'), 11.5);
    assert.equal(parseInput('bool', 'on'), true);
    assert.throws(() => parseInput('uint8', '1.5'), /whole number/);
    assert.throws(() => parseInput('uint8', '-1'), /negative/);
    assert.throws(() => parseInput('float', 'x'), /number/);
});
