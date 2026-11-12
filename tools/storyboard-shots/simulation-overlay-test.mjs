// SPDX-License-Identifier: LGPL-2.1-only
// End-to-end U15 gate: a board result remains measured-only until its action
// replays the same procedure on the native simulator, then both linked records
// and both traces appear together.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port] = process.argv.slice(2);
const setup = process.env.OWNSTUDIO_STORYBOARD_SETUP;
const app = await connect(port);
const exceptions = [];
app.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text));
await app.send('Runtime.enable');
await waitForWindow(app);
await sleep(2500);
await app.clickOn('[id="shell-tab-ownstudio.left.lab"]');
for (let n = 0; n < 40 && !await app.evaluate(`document.querySelector('[data-run-target="board"]')?.dataset.ready === 'true'`); n++) await sleep(400);

const failures = [];
const ready = await app.evaluate(`(() => { const e = document.querySelector('[data-run-target="board"]'); return e && { ready: e.dataset.ready, disabled: e.disabled, title: e.title }; })()`);
if (!ready || ready.ready !== 'true' || ready.disabled) failures.push(`board capture is not ready: ${JSON.stringify(ready)}`);
await app.evaluate(`document.querySelector('[data-run-target="board"]')?.scrollIntoView({ block: 'center' }); true`);
await sleep(300);
const clicked = await app.clickOn('[data-run-target="board"]');
if (!clicked) failures.push('board capture button missing');
await sleep(1000);
const afterClick = await app.evaluate(`(() => ({
    buttons: [...document.querySelectorAll('button')].map(e => e.textContent.trim()).filter(Boolean),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(e => e.textContent.trim()),
    problem: document.querySelector('.ownstudio-problem')?.textContent?.trim(),
    main: document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current')?.textContent?.trim()
}))()`);
const confirmed = await app.evaluate(`(() => { const button = [...document.querySelectorAll('button')]
    .find(e => e.textContent.trim() === 'Switch on and run'); button?.click(); return !!button; })()`);
if (!confirmed) failures.push('power confirmation did not open');

if (!confirmed) {
    console.log(JSON.stringify({ failures, ready, clicked, afterClick, exceptions }, null, 1));
    app.close();
    process.exit(1);
}

for (let n = 0; n < 80 && !await app.evaluate(`!!document.querySelector('[data-simulate-record]')`); n++) await sleep(400);
const before = await app.evaluate(`(() => ({
    measured: !!document.querySelector('.ownstudio-uplot canvas'),
    simulate: document.querySelector('[data-simulate-record]')?.textContent?.trim(),
    dashed: !!document.querySelector('.os-trace-sim'),
    actions: [...document.querySelectorAll('.ownstudio-result-actions button')].map(e => e.textContent.trim()),
    conditions: [...document.querySelectorAll('.ownstudio-card .ownstudio-muted')].map(e => e.textContent.trim()).find(t => t.startsWith('Conditions:'))
}))()`);
if (!before.measured) failures.push('measured result did not open');
if (before.simulate !== 'Simulate at these conditions') failures.push(`simulate action is ${JSON.stringify(before.simulate)}`);
if (before.dashed) failures.push('simulation was already drawn before its action');
if (!before.actions.includes('Open in PulsimGui') || !before.actions.includes('Report')) failures.push('result actions are incomplete');

if (!failures.length) await app.clickOn('[data-simulate-record]');
for (let n = 0; n < 200 && !await app.evaluate(`!!document.querySelector('.os-trace-sim')`); n++) await sleep(500);
const after = await app.evaluate(`(() => ({
    dashed: !!document.querySelector('.os-trace-sim'),
    label: document.querySelector('.ownstudio-bode')?.getAttribute('aria-label'),
    simulate: !!document.querySelector('[data-simulate-record]'),
    linked: [...document.querySelectorAll('.ownstudio-card .ownstudio-muted')].map(e => e.textContent.trim()).find(t => t.startsWith('Simulated at')),
    headings: [...document.querySelectorAll('.ownstudio-overlay-table th')].map(e => e.textContent.trim()),
    rows: [...document.querySelectorAll('.ownstudio-overlay-table tbody tr')].map(e => e.textContent.trim()),
    error: document.querySelector('.ownstudio-problem')?.textContent?.trim()
}))()`);
if (!after.dashed) failures.push(`overlay did not appear${after.error ? `: ${after.error}` : ''}`);
if (!after.label?.includes('measured on the board') || !after.label?.includes('simulated')) failures.push(`overlay label is ${JSON.stringify(after.label)}`);
if (after.simulate) failures.push('simulate action remained after the records were linked');
if (!after.linked?.includes('same conditions')) failures.push('linked-simulation sentence missing');
for (const heading of ['Simulation', 'Board', 'Board − simulation']) if (!after.headings.includes(heading)) failures.push(`${heading} column missing`);
if (after.rows.length !== 3) failures.push(`comparison has ${after.rows.length} rows`);

const filesBelow = root => {
    if (!root || !existsSync(root)) return [];
    const out = [];
    for (const name of readdirSync(root)) {
        const path = join(root, name);
        if (statSync(path).isDirectory()) out.push(...filesBelow(path)); else out.push(path);
    }
    return out;
};
const recordFiles = filesBelow(setup && join(setup, 'ownstudio', 'records')).filter(path => path.endsWith('/record.json'));
const records = recordFiles.map(path => ({ path, value: JSON.parse(readFileSync(path, 'utf8')) }));
const board = records.filter(record => record.value.target === 'board').at(-1);
const sim = records.find(record => record.value.target === 'simulator' && board && record.value.twin === board.path.split('/').at(-2));
if (!board || !sim) failures.push('linked board and simulator record files not found');
if (board && sim) {
    if (board.value.twin !== sim.path.split('/').at(-2)) failures.push('board record does not link back to simulator');
    if (board.path.split('/').at(-3) !== sim.path.split('/').at(-3)) failures.push('records are not in one campaign');
    if (board.value.conditions.v_high_V !== 29.9 || sim.value.conditions.v_high_V !== 29.9) failures.push('measured HIGH was not replayed');
    if (board.value.conditions.load_ohm !== sim.value.conditions.load_ohm) failures.push('load condition changed in simulation');
}

console.log(JSON.stringify({ failures, ready, clicked, afterClick, before, after, exceptions, board: board?.path, simulation: sim?.path }, null, 1));
app.close();
process.exit(failures.length || exceptions.length ? 1 : 0);
