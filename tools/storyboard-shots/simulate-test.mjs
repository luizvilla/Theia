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
const seen = [];          // F4: what the progress bar said while it ran
while (Date.now() - started < 600_000) {
    shown = await app.evaluate(`!!document.querySelector('.ownstudio-capture-result')`);
    if (shown) { break; }
    const p = await app.evaluate(`(() => { const e = document.querySelector('[data-progress]'); return e && { f: e.dataset.progress, text: e.textContent }; })()`);
    if (p) { seen.push(p); }
    await sleep(1000);
}
const seconds = ((Date.now() - started) / 1000).toFixed(0);
check(shown, `Simulate runs the capture and opens its result (${seconds} s)`);
const fractions = seen.map(p => Number(p.f)).filter(f => f > 0);
check(fractions.length >= 5 && fractions.every((f, i) => i === 0 || f >= fractions[i - 1]) && fractions.at(-1) > 0.8,
    `the bar rises with simulated time (${fractions.length} readings, last ${(fractions.at(-1) ?? 0).toFixed(2)})`);
check(seen.some(p => /Building the control code/.test(p.text)), 'it says when it is building the control code');
check(seen.some(p => /about \d+ (s|min) left/.test(p.text)), `and how long is left ("${seen.find(p => /left/.test(p.text))?.text ?? seen.at(-1)?.text}")`);
const added = (fs.existsSync(records) ? fs.readdirSync(records) : []).filter(d => !before.has(d));
const record = added.map(d => path.join(records, d, 'capture-simulator', 'record.json')).find(f => fs.existsSync(f));
const text = record ? fs.readFileSync(record, 'utf8') : '';
check(/"v_in_V": "?30(\.0)?"?[,}\s]/.test(text), `at the canvas's 30 V (${record ? path.relative(setup, record) : 'no record'})`);

// Cancel: a second run, cancelled once the bar moves, ends within a few seconds and files nothing.
const labShown = () => app.evaluate(`!!document.querySelector('button[data-run-target="simulator"]')?.getClientRects().length`);
if (!await labShown()) {          // the result is in front: back to the Lab's own tab
    const tab = await app.evaluate(`(() => { const e = [...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tab')]
        .find(e => e.textContent.trim() === 'Lab'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (tab) { await app.click(tab.x, tab.y); }
    await sleep(1000);
}
const filed = fs.readdirSync(records).length;
await press('button[data-run-target="simulator"]');
const second = Date.now();
let moving = 0;
while (Date.now() - second < 120_000 && !(moving > 0.05)) {
    moving = Number(await app.evaluate(`document.querySelector('[data-progress]')?.dataset.progress || 0`));
    await sleep(500);
}
check(moving > 0.05, `a second run is under way before Cancel (bar at ${moving.toFixed(2)})`);
check(await app.clickOn('button[data-stop-run]'), 'Cancel is there while it runs');
const cancelled = Date.now();
let ended = false;
while (Date.now() - cancelled < 15_000) {
    ended = await app.evaluate(`!document.querySelector('button[data-stop-run]')`);
    if (ended) { break; }
    await sleep(250);
}
check(ended, `Cancel ends the run (${((Date.now() - cancelled) / 1000).toFixed(1)} s)`);
check(fs.readdirSync(records).length === filed, 'and files no record');

app.close();
process.exit(failures ? 1 : 0);
