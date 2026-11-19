// SPDX-License-Identifier: LGPL-2.1-only
// F3 gate (Q173b, Q174): in the Lab, Simulate sits beside the board capture. On a canvas
// with the Twist alone it is greyed out with its sentence; "Add the bench source and load"
// wires 30 V and 33 Ω; Simulate then runs the capture on the simulator at those values,
// with no board. Run it on a setup whose canvas holds the Twist alone:
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/simulate-test.mjs <port> <setup>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
let failures = 0;
let app;
/** Scrolls a Lab button into view first, as a user does: the Lab page is taller than its area. */
const press = async selector => {
    await app.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`);
    await sleep(300);
    return app.clickOn(selector);
};
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');
await app.clickOn('.lm-TabBar.theia-app-left .lm-TabBar-content [id="shell-tab-ownstudio.left.lab"]');
await sleep(1500);

const state = () => app.evaluate(`(() => {
    const b = document.querySelector('button[data-run-target="simulator"]');
    return { found: !!b, disabled: b?.disabled, missing: document.querySelector('[data-simulate-missing]')?.textContent ?? '',
        pulsim: !!document.querySelector('button[data-open-pulsimgui]'),
        nodes: Number(document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas')?.dataset.nodeCount ?? -1) };
})()`);

let s = await state();
check(s.found && s.disabled, `Simulate is in the Lab and greyed out on the Twist alone (found ${s.found}, disabled ${s.disabled})`);
check(s.missing.startsWith('Add a source on HIGH and a load on LOW1 to simulate.'), `with its sentence ("${s.missing}")`);
check(s.pulsim, 'Open in PulsimGui is there too');

await press('button[data-add-bench]');
await sleep(1500);
s = await state();
check(s.found && !s.disabled && !s.missing, `the bench shortcut makes it ready (disabled ${s.disabled}, sentence "${s.missing}")`);
const edges = await app.evaluate(`document.querySelectorAll('#ownstudio\\\\.canvas .react-flow__edge').length`);
check(s.nodes === 3 && edges === 2, `with a source and a load wired on the canvas (nodes ${s.nodes}, wires ${edges})`);

const records = path.join(setup, 'ownstudio/records');
const before = new Set(fs.existsSync(records) ? fs.readdirSync(records) : []);
const started = Date.now();
await press('button[data-run-target="simulator"]');
let shown = false;
while (Date.now() - started < 600_000) {
    shown = await app.evaluate(`!!document.querySelector('.ownstudio-capture-result')`);
    if (shown) { break; }
    await sleep(1000);
}
const seconds = ((Date.now() - started) / 1000).toFixed(0);
check(shown, `Simulate runs the capture and opens its result (${seconds} s)`);
const added = (fs.existsSync(records) ? fs.readdirSync(records) : []).filter(d => !before.has(d));
const record = added.map(d => path.join(records, d, 'capture-simulator', 'record.json')).find(f => fs.existsSync(f));
const text = record ? fs.readFileSync(record, 'utf8') : '';
check(/"v_in_V": "?30(\.0)?"?[,}\s]/.test(text), `at the canvas's 30 V (${record ? path.relative(setup, record) : 'no record'})`);

app.close();
process.exit(failures ? 1 : 0);
