// SPDX-License-Identifier: LGPL-2.1-only
// F11 gate (Q183): on Design › Control loop, "control.cpp has Kp = …, Ti = …" links each gain to its
// line; a click opens control.cpp in Code with the cursor on that line. After Apply, the
// notification's "Show in the code" does the same for Kp.
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/gain-link-test.mjs <setup>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(4000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const waitFor = async (expression, ms = 20000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const v = await app.evaluate(expression); if (v) { return v; } }
    return null;
};
const lines = fs.readFileSync(path.join(setup, 'src/control.cpp'), 'utf8').split('\n');
const lineOf = name => lines.findIndex(l => l.startsWith(`static const float ${name} =`)) + 1;
const cursor = () => app.evaluate(`document.querySelector('#theia-statusBar')?.textContent.match(/Ln (\\d+)/)?.[1] ?? ''`);
const activeTitle = () => app.evaluate(`document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel')?.textContent ?? ''`);
const toDesign = async () => {
    await app.clickOn('[id="shell-tab-ownstudio.left.design"]');
    await sleep(800);
    await app.clickOn('.ownstudio-sheet-item[data-sheet="control_loop"]');
    return waitFor(`!!document.querySelector('[data-gain-link="kp"]')`);
};

check(await toDesign(), 'Design › Control loop shows the gains in control.cpp as links');
for (const [gain, name] of [['kp', 'kp'], ['ti', 'Ti']]) {
    const text = await app.evaluate(`document.querySelector('[data-gain-link="${gain}"]')?.textContent ?? ''`);
    check(text.includes(`(line ${lineOf(name)})`), `${name}'s link names its line ("${text}", control.cpp line ${lineOf(name)})`);
    await app.clickOn(`[data-gain-link="${gain}"]`);
    await waitFor(`/control\\.cpp/.test(document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel')?.textContent ?? '')`, 8000);
    const want = String(lineOf(name));
    for (let i = 0; i < 20 && await cursor() !== want; i++) { await sleep(250); }
    const ln = await cursor();
    check((await activeTitle()) === 'control.cpp' && ln === String(lineOf(name)), `a click opens control.cpp on that line ("${await activeTitle()}", Ln ${ln})`);
    if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/gain-link-${gain}.png`, await app.screenshot()); }
    await toDesign();
}

// Apply a new Kp, then "Show in the code" in its notification.
await app.evaluate(`(() => { const i = document.querySelector('[data-field="kp"] input.ownstudio-number'); i.focus(); i.select(); })()`);
await app.send('Input.insertText', { text: '0.0005' });
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }
await waitFor(`document.querySelector('[data-action="apply"]')?.disabled === false`);
await app.clickOn('[data-action="apply"]');
const button = await waitFor(`(() => { const b = [...document.querySelectorAll('.theia-notification-list-item button, .theia-notification-actions button')]
    .find(b => b.textContent.trim() === 'Show in the code'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`, 15000);
check(!!button, 'the Apply notification offers "Show in the code"');
if (button) {
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: button.x, y: button.y });
    await app.click(button.x, button.y);
    await sleep(2000);
    const ln = await cursor();
    check((await activeTitle()) === 'control.cpp' && ln === String(lineOf('kp')), `it opens control.cpp on Kp's line ("${await activeTitle()}", Ln ${ln})`);
}

app.close();
process.exit(failures ? 1 : 0);
