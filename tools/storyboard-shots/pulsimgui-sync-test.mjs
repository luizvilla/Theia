// SPDX-License-Identifier: LGPL-2.1-only
// U14 end-to-end gate: an external PulsimGui-style save is watched by the
// running app, the named Rload value is persisted to setup.yaml, and the
// already-open React Flow canvas redraws it.
import fs from 'node:fs';
import path from 'node:path';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port, setupArg] = process.argv.slice(2);
const setup = setupArg || process.env.OWNSTUDIO_STORYBOARD_SETUP;
if (!setup) {
    throw new Error('pass the setup folder to pulsimgui-sync-test.mjs');
}

const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.clickOn('[id="shell-tab-ownstudio.canvas"]');
await sleep(1000);

const resistorText = () => app.evaluate(`document.querySelector('.react-flow__node[data-id="load"] .ownstudio-node-rows')?.textContent?.trim() ?? null`);
const before = await resistorText();
const plantPath = path.join(setup, 'ownstudio', 'plant', 'twist_buck.pulsim');
const plant = JSON.parse(fs.readFileSync(plantPath, 'utf8'));
const components = Object.fromEntries(Object.values(plant.circuits.main.components).map(component => [component.name, component]));
for (const name of ['Vin', 'Rload', 'L', 'C']) {
    if (!components[name]) throw new Error(`the setup plant has no named ${name} component`);
}
// Opening through OwnStudio applies the canvas's current values before the
// user edits. This file write represents saving that in-memory project after
// changing only Rload.
components.Vin.parameters.waveform.value = 30;
components.Rload.parameters.resistance = 27.5;
components.L.parameters.inductance = 33e-6;
components.C.parameters.capacitance = 14.1e-6;
fs.writeFileSync(plantPath, JSON.stringify(plant, null, 2) + '\n');

let after = null;
const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
    after = await resistorText();
    if (after?.includes('27.5 Ω')) {
        break;
    }
    await sleep(250);
}
const setupText = fs.readFileSync(path.join(setup, 'ownstudio', 'setup.yaml'), 'utf8');
const failures = [];
if (!before?.includes('33 Ω')) failures.push(`canvas began with ${JSON.stringify(before)}, expected 33 Ω`);
if (!after?.includes('27.5 Ω')) failures.push(`canvas ended with ${JSON.stringify(after)}, expected 27.5 Ω`);
if (!setupText.includes('ohm: 27.5')) failures.push('setup.yaml did not receive Rload = 27.5 Ω');

console.log(JSON.stringify({ before, after, setupYaml: setupText.includes('ohm: 27.5'), failures }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
