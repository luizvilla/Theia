// SPDX-License-Identifier: LGPL-2.1-only
// F13 gate (Q186), and F16's File › New setup…: from the Start page, File › New setup… asks for a
// name, names each stage while it runs, and opens the new setup with the Twist on its canvas.
// The time from the name's Enter to the canvas is measured (target: under 3 s, Core local).
// Run it with no folder and a local Core (OWNSTUDIO_CORE_UPSTREAM):
//   tools/storyboard-shots/run.sh <port> - tools/storyboard-shots/new-setup-test.mjs
import * as fs from 'node:fs';
import { chooseMenu, connect, sleep, waitForWindow } from './cdp.mjs';

const port = process.argv[2];
let app = await connect(port);
await waitForWindow(app);
await sleep(4000);
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

check(await chooseMenu(app, 'File', 'New setup…'), 'File › New setup… from the Start page');
await sleep(1200);
const name = `f13-${Date.now() % 100000}`;
await app.evaluate(`(() => { const i = document.querySelector('.quick-input-box input'); i.focus(); i.select(); })()`);
await app.send('Input.insertText', { text: name });
await sleep(300);
const enter = Date.now();
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }

// The stages, read from the progress notification until the window reloads on the new setup.
const stages = [];
const times = [];
let reloaded = 0;
let opened = 0;
while (Date.now() - enter < 60_000) {
    try {
        const s = await app.evaluate(`(() => ({ text: [...document.querySelectorAll('.theia-notification-list-item')].map(e => e.textContent).join(' | '),
            canvas: !!document.querySelector('.react-flow__node[data-id="board"]'), title: document.title }))()`);
        const stage = s.text.match(/\d\/3 [^|]*?…/)?.[0];
        if (stage && stages.at(-1) !== stage) { stages.push(stage); times.push(Date.now() - enter); }
        if (s.canvas && s.title.includes(name)) { opened = Date.now(); break; }
    } catch {
        reloaded ||= Date.now() - enter;
        app.close();                                          // the window reloads: attach again
        await sleep(200);
        app = await connect(port).catch(() => app);
    }
    await sleep(50);
}
const seconds = (opened - enter) / 1000;
console.log(`timing: ${stages.map((st, i) => `${st.slice(0, 3)} at ${(times[i] / 1000).toFixed(2)} s`).join(', ')}; window reload from ${(reloaded / 1000).toFixed(2)} s; canvas at ${seconds.toFixed(2)} s`);
check(stages.length >= 2 && /^1\/3 Updating OwnTech Core/.test(stages[0]), `it names its stages (${stages.join(' → ')})`);
check(!!opened, `the new setup opens with the Twist on its canvas (${opened ? `${seconds.toFixed(1)} s` : 'not within 60 s'})`);
check(opened && seconds < 3, `in under 3 s from Enter (${seconds.toFixed(1)} s)`);
if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/new-setup.png`, await app.screenshot()); }

app.close();
process.exit(failures ? 1 : 0);
