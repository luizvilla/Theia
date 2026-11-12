// SPDX-License-Identifier: LGPL-2.1-only
// End-to-end U12 gate: board form, guarded run, filed artifacts and interactive result.
import { existsSync, readdirSync, statSync } from 'node:fs';
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
await sleep(4500);

const before = await app.evaluate(`(() => ({
    fields: [...document.querySelectorAll('.ownstudio-capture-form > div')].map(e => e.textContent.trim()),
    run: (() => { const e = document.querySelector('[data-run-target="board"]'); return e && { disabled: e.disabled, ready: e.dataset.ready, text: e.textContent.trim() }; })()
}))()`);
const failures = [];
if (before.fields.length !== 3) failures.push(`capture form has ${before.fields.length} fields`);
if (!before.fields.some(text => text.includes('V_LOW1') && text.includes('I_LOW1'))) failures.push('capture channels missing');
if (!before.fields.some(text => text.includes('10') && text.includes('12'))) failures.push('reference step missing');
if (!before.fields.some(text => text.includes('100 ms') && text.includes('20 ms') && text.includes('100 µs'))) failures.push('capture window missing');
if (!before.run || before.run.disabled || before.run.ready !== 'true') failures.push(`board capture is not ready: ${JSON.stringify(before.run)}`);

if (!failures.length) {
    // Since U15 the procedure view is taller: bring the button on screen before clicking it, as a user would.
    await app.evaluate(`document.querySelector('[data-run-target="board"]')?.scrollIntoView({ block: 'center' }); true`);
    await sleep(300);
    await app.clickOn('[data-run-target="board"]');
    await sleep(500);
    const confirmed = await app.evaluate(`(() => { const button = [...document.querySelectorAll('button')]
        .find(e => e.textContent.trim() === 'Switch on and run'); button?.click(); return !!button; })()`);
    if (!confirmed) failures.push('power confirmation did not open');
}

for (let n = 0; n < 50 && !await app.evaluate(`!!document.querySelector('.ownstudio-uplot')`); n++) await sleep(400);
const result = await app.evaluate(`(() => ({
    plot: !!document.querySelector('.ownstudio-uplot canvas'),
    viewport: (() => { const e = document.querySelector('.ownstudio-capture-result'); return e && [e.dataset.viewStart, e.dataset.viewEnd]; })(),
    controls: [...document.querySelectorAll('.ownstudio-plot-controls button')].map(e => e.textContent.trim()),
    metrics: [...document.querySelectorAll('.ownstudio-overlay-table tbody tr')].map(e => e.textContent.trim()),
    report: [...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Report' || e.textContent.includes('Open HTML report')),
    error: document.querySelector('.ownstudio-problem')?.textContent?.trim()
}))()`);
if (!result.plot) failures.push(`uPlot did not open${result.error ? `: ${result.error}` : ''}`);
if (JSON.stringify(result.viewport) !== JSON.stringify(['-0.005', '0.04'])) failures.push(`initial viewport is ${JSON.stringify(result.viewport)}`);
for (const label of ['Whole run', 'V_LOW1_V', 'I_LOW1_A']) if (!result.controls.includes(label)) failures.push(`${label} control missing`);
if (!result.metrics.some(text => text.includes('Final voltage')) || !result.metrics.some(text => text.includes('Overshoot'))) failures.push('capture metrics missing');
if (!result.report) failures.push('HTML report button missing');
if (result.plot) {
    await app.clickOn('.ownstudio-plot-controls button');
    await sleep(250);
    const whole = await app.evaluate(`(() => { const e = document.querySelector('.ownstudio-capture-result');
        return e && [Number(e.dataset.currentStart), Number(e.dataset.currentEnd)]; })()`);
    if (!whole || whole[0] > -0.02 || whole[1] < 0.08) failures.push(`Whole run scale is ${JSON.stringify(whole)}`);
    await app.clickOn('.ownstudio-plot-controls button:nth-of-type(3)');
    const currentPressed = await app.evaluate(`document.querySelector('.ownstudio-plot-controls button:nth-of-type(3)')?.getAttribute('aria-pressed')`);
    if (currentPressed !== 'false') failures.push('current channel did not turn off');
}

const filesBelow = root => {
    if (!root || !existsSync(root)) return [];
    const out = [];
    for (const name of readdirSync(root)) {
        const path = join(root, name);
        if (statSync(path).isDirectory()) out.push(...filesBelow(path)); else out.push(path);
    }
    return out;
};
const records = (setup ? filesBelow(join(setup, 'ownstudio', 'records')) : []).filter(path => path.endsWith('/record.json'));
const reports = (setup ? filesBelow(join(setup, 'ownstudio', 'reports')) : []).filter(path => path.endsWith('.html'));
if (!records.length) failures.push('no record.json filed under ownstudio/records');
if (!reports.length) failures.push('no HTML report filed under ownstudio/reports');

console.log(JSON.stringify({ failures, before, result, exceptions, record: records.at(-1), report: reports.at(-1) }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
