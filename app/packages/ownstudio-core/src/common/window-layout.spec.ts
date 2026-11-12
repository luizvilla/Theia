// SPDX-License-Identifier: LGPL-2.1-only
// Layout tests (plan U2): the window table matches SPEC §5 and storyboard frame 0.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BOTTOM_SLOTS, CANVAS_TINT, REMOVED_WIDGETS, RIGHT_SLOTS, STATUS_ACTIONS, WORKBENCH_SLOTS, bottomSlotOf, rightSlotOf, workbenchOfLeftWidget
} from './window-layout.js';
import { fileURLToPath } from 'node:url';

// ES module: where this file is (the bundle, for the backend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const css = fs.readFileSync(path.join(__dirname, '../../src/browser/style/ownstudio.css'), 'utf8');

test('the left icon bar holds Design, Code, Lab, in that order, on Ctrl+1..3; no Home', () => {
    assert.deepEqual(WORKBENCH_SLOTS.map(w => w.label), ['Design', 'Code', 'Lab']);
    assert.deepEqual(WORKBENCH_SLOTS.map(w => w.keybinding), ['ctrlcmd+1', 'ctrlcmd+2', 'ctrlcmd+3']);
    assert.ok(!WORKBENCH_SLOTS.some(w => /home/i.test(w.id + w.label)));
});

test('the right icon bar holds Parts, Inspector, AI; the bottom tabs Canvas, Terminal, Build output', () => {
    assert.deepEqual(RIGHT_SLOTS.map(s => s.label), ['Parts', 'Inspector', 'AI']);
    assert.deepEqual(BOTTOM_SLOTS.map(s => s.label), ['Canvas', 'Terminal', 'Build output']);
});

test('the status bar starts with Build, Upload, Serial', () => {
    assert.deepEqual(STATUS_ACTIONS.map(a => a.label), ['Build', 'Upload', 'Serial']);
});

test('every icon on both icon bars has its drawing in the stylesheet', () => {
    for (const slot of [...WORKBENCH_SLOTS, ...RIGHT_SLOTS]) {
        assert.match(css, new RegExp(`\\.ownstudio-icon-${slot.icon}\\s*\\{[^}]*mask`), `icon ${slot.icon}`);
    }
});

test('widget ids are unique and each finds its slot back', () => {
    const ids = [...WORKBENCH_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS].map(s => s.widgetId);
    assert.equal(new Set(ids).size, ids.length);
    for (const w of WORKBENCH_SLOTS) { assert.equal(workbenchOfLeftWidget(w.widgetId), w); }
    for (const s of RIGHT_SLOTS) { assert.equal(rightSlotOf(s.widgetId), s); }
    assert.equal(bottomSlotOf('terminal-3')?.id, 'terminal');
    assert.equal(bottomSlotOf('outputView')?.id, 'build-output');
    assert.equal(workbenchOfLeftWidget('ownstudio.workbench.home'), undefined);
});

test('each workbench tints the canvas differently; removed 1.0 widgets are not in the table', () => {
    assert.equal(new Set(Object.values(CANVAS_TINT)).size, 3);
    const ids = [...WORKBENCH_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS].flatMap(s => [s.widgetId, (s as { centreId?: string }).centreId]);
    for (const removed of REMOVED_WIDGETS) { assert.ok(!ids.includes(removed), removed); }
});
