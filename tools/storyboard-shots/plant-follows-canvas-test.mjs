// SPDX-License-Identifier: LGPL-2.1-only
// F2 gate (Q172): in the running app, the plant file follows the canvas, OwnStudio's own
// write adds no "PulsimGui saved" dot, and a PulsimGui save of a value comes back to the
// canvas as one dot. Run it on a setup whose canvas holds the Twist alone:
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/plant-follows-canvas-test.mjs <setup>
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { connect, sleep, waitForWindow, wire } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
const plantFile = path.join(setup, 'ownstudio/plant/twist_buck.pulsim');
const plant = () => {
    const parts = Object.fromEntries(JSON.parse(fs.readFileSync(plantFile, 'utf8')).circuits.main.components.map(c => [c.name, c.parameters]));
    return { Vin: parts.Vin.waveform.value, Rload: parts.Rload.resistance, L: parts.L.inductance, C: parts.C.capacitance };
};
const dots = () => execFileSync('git', ['-C', setup, 'log', '--format=%s'], { encoding: 'utf8' }).trim().split('\n');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');
for (const [sel, content] of [
    ['.lm-TabBar.theia-app-right .lm-TabBar-content [id="shell-tab-ownstudio.parts"]', '#ownstudio\\.parts [data-part]'],
    ['#theia-bottom-content-panel [id="shell-tab-ownstudio.canvas"]', '#ownstudio\\.canvas .ownstudio-canvas'],
]) {
    if (!await app.evaluate(`!!document.querySelector(${JSON.stringify(content)})?.getClientRects().length`)) {
        await app.clickOn(sel);
        await sleep(800);
    }
}

const template = plant();
for (const part of ['dc-source', 'resistor']) {
    await app.clickOn(`#ownstudio\\.parts [data-part="${part}"]`);
    await sleep(900);
}
await wire(app, ['dc-source', 'out'], ['board', 'HIGH']);
await wire(app, ['board', 'LOW1'], ['resistor', 'in']);
await sleep(3000);          // the canvas save and its plant write
const wired = plant();
check(wired.Vin === 30 && wired.Rload === 33, `wiring puts the bench's 30 V and 33 Ω in the plant (template ${template.Vin} V, ${template.Rload} Ω; now ${wired.Vin} V, ${wired.Rload} Ω)`);

await sleep(9000);          // the canvas commit (10 s after the last edit) and the PulsimGui watcher
check(!dots().some(s => s.startsWith('simulation: PulsimGui')), `OwnStudio's own plant write adds no PulsimGui dot (dots: ${dots().slice(0, 4).join(' | ')})`);
check(execFileSync('git', ['-C', setup, 'status', '--porcelain', '--', 'ownstudio/plant'], { encoding: 'utf8' }).trim() === '',
    'the plant write is committed with the canvas event');

// A save in PulsimGui: Vin 28 V written into the file by another program.
const document = JSON.parse(fs.readFileSync(plantFile, 'utf8'));
document.circuits.main.components.find(c => c.name === 'Vin').parameters.waveform.value = 28;
fs.writeFileSync(plantFile, JSON.stringify(document, null, 2) + '\n');
await sleep(5000);
const voltage = await app.evaluate(`document.querySelector('.react-flow__node[data-id="dc-source"]')?.textContent ?? ''`);
check(/28/.test(voltage), `a PulsimGui save of Vin 28 V shows on the canvas ("${voltage}")`);
check(dots()[0] === 'simulation: PulsimGui changed Vin', `and makes one dot ("${dots()[0]}")`);

app.close();
process.exit(failures ? 1 : 0);
