// SPDX-License-Identifier: LGPL-2.1-only
// F8 gate (Q179): two Spins plugged in (the storyboard bridge's SPIN-A and SPIN-B). The status bar
// and the Lab checklist ask for a choice; Board › Select board… lists both by serial number; the
// choice links that board, is remembered by the setup (not a timeline dot), and holds after a
// restart (second run with "again").
//   OWNSTUDIO_STORYBOARD_BOARD=1 OWNSTUDIO_STORYBOARD_BOARDS=SPIN-A,SPIN-B \
//     tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/board-picker-test.mjs <setup> [again]
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chooseMenu, connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup, again] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(5000);
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const status = () => app.evaluate(`[...document.querySelectorAll('#theia-statusBar .element')].map(e => e.textContent.trim()).find(t => /board|Twist|SPIN/i.test(t)) ?? ''`);
const waitStatus = async pattern => { let s = ''; for (let i = 0; i < 40 && !pattern.test(s = await status()); i++) { await sleep(250); } return s; };
const choice = path.join(setup, '.git', 'ownstudio-board');

if (!again) {
    let s = await waitStatus(/2 boards · choose one/);
    check(/2 boards · choose one/.test(s), `the status bar asks for a choice ("${s}")`);
    const line = await app.evaluate(`document.querySelector('[data-check="board"]')?.textContent ?? ''`);
    check(/2 boards are connected: choose the one this setup works with\..*Select board…/.test(line), `so does the Lab checklist, with its button ("${line}")`);
    const dots = execFileSync('git', ['-C', setup, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim();

    check(await chooseMenu(app, 'Board', 'Select board…'), 'Board › Select board…');
    // The test window has no focus from the system: a quick pick would close at once on blur.
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    for (let i = 0; i < 20 && !await app.evaluate(`document.querySelectorAll('.quick-input-list .monaco-list-row').length`); i++) { await sleep(250); }
    const rows = await app.evaluate(`[...document.querySelectorAll('.quick-input-list .monaco-list-row')].map(r => r.textContent.trim())`);
    check(rows.length === 2 && rows.some(r => r.includes('SPIN-A')) && rows.some(r => r.includes('SPIN-B')), `it lists both by serial number (${JSON.stringify(rows)})`);
    const b = await app.evaluate(`(() => { const r = [...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(r => r.textContent.includes('SPIN-B'));
        const x = r.getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; })()`);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
    await app.click(b.x, b.y);
    s = await waitStatus(/SPIN-B/);
    check(/Twist [\d.]+ SPIN-B/.test(s) && !/choose/.test(s), `choosing SPIN-B links it ("${s}")`);
    check(fs.existsSync(choice) && fs.readFileSync(choice, 'utf8').trim() === 'SPIN-B', 'the setup remembers SPIN-B');
    check(execFileSync('git', ['-C', setup, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim() === dots
        && !execFileSync('git', ['-C', setup, 'status', '--porcelain'], { encoding: 'utf8' }).includes('ownstudio-board'), 'and it is not a timeline dot');
    const after = await app.evaluate(`document.querySelector('[data-check="board"]')?.textContent ?? ''`);
    check(!/choose/.test(after), `the Lab checklist's board line moves on ("${after}")`);
} else {
    const s = await waitStatus(/SPIN-B/);
    check(/Twist [\d.]+ SPIN-B/.test(s), `after a restart, the setup links SPIN-B again by itself ("${s}")`);
}
if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/board-picker${again ? '-again' : ''}.png`, await app.screenshot()); }

app.close();
process.exit(failures ? 1 : 0);
