// SPDX-License-Identifier: LGPL-2.1-only
// F16 gate: the menu items that said "(slice 1)" each do something. Run on a setup with a report,
// one storyboard board (OWNSTUDIO_STORYBOARD_BOARD=1):
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/menu-commands-test.mjs
// New setup… and Select board… have their own tests (new-setup-test, board-picker-test).
import { chooseMenu, connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(6000);
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const escape = async () => { for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); } await sleep(400); };
const notes = () => app.evaluate(`[...document.querySelectorAll('.theia-notification-list-item')].map(e => e.textContent).join(' | ')`);
const clearNotes = () => app.evaluate(`document.querySelectorAll('.theia-notification-list-item .codicon-notifications-clear, .theia-notification-list-item .clear-all').forEach(b => b.click())`);
// A quick pick in the test window hides on blur (the window has no focus from the system), but it
// is filled in first: read its rows and its placeholder, whether shown or not.
const picker = () => app.evaluate(`({ placeholder: document.querySelector('.quick-input-box input')?.placeholder ?? '',
    rows: [...document.querySelectorAll('.quick-input-list .monaco-list-row')].map(r => r.textContent.trim()) })`);
const pick = placeholder => until(picker, v => placeholder.test(v.placeholder) && v.rows.length > 0).then(v => placeholder.test(v.placeholder) ? v.rows : []);
const until = async (read, ok, ms = 6000) => { let v; for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) { v = await read(); if (ok(v)) { break; } } return v; };
/** A menu item whose command opens a picker; the test window loses a click now and then: once more if nothing came. */
const menuPick = async (path, placeholder) => {
    let ok = await menu(...path);
    let found = await pick(placeholder);
    if (!found.length) { ok = await menu(...path); found = await pick(placeholder); }
    return [ok, found];
};
const menu = async (...path) => {
    // A neutral spot first (the canvas), so no menu, dialog or picker of the step before is in the way.
    const spot = await app.evaluate(`(() => { const r = document.querySelector('#theia-bottom-content-panel')?.getBoundingClientRect(); return r && { x: r.x + 30, y: r.y + r.height - 30 }; })()`);
    if (spot) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y }); await app.click(spot.x, spot.y); await sleep(300); }
    return chooseMenu(app, ...path);
};
const shownLabels = await app.evaluate(`(async () => { const out = []; for (const item of document.querySelectorAll('#theia-top-panel .lm-MenuBar-item')) out.push(item.textContent); return out; })()`);

check(await menu('Setup', 'Check setup'), 'Setup › Check setup');
let n = await until(notes, t => /Lab checks hold/.test(t));
if (!/Lab checks hold/.test(n)) {          // the first menu click after start can be lost: once more
    await menu('Setup', 'Check setup');
    n = await until(notes, t => /Lab checks hold/.test(t));
}
const lab = await app.evaluate(`document.body.dataset.ownstudioWorkbench`);
check(/\d of 6 Lab checks hold\.|All 6 Lab checks hold/.test(n) && lab === 'lab', `shows the Lab and says how many checks hold ("${n.slice(0, 120)}", workbench ${lab})`);
await clearNotes();

check(await menu('Board', 'Board info'), 'Board › Board info');
const info = await until(() => app.evaluate(`document.querySelector('.dialogOverlay .dialogContent')?.textContent ?? ''`), t => /serial number/.test(t));
check(/serial number STORYBOARD/.test(info) && /Firmware build/.test(info), `shows the linked board ("${info.slice(0, 120)}")`);
await escape();
if (await app.evaluate(`!!document.querySelector('.dialogOverlay')?.getClientRects().length`)) {
    await app.clickOn('.dialogOverlay .dialogControl .theia-button.main');
    await sleep(500);
}

let [ok, r] = await menuPick(['Board', 'Boards manager…'], /Boards known to OwnStudio/);
check(ok, 'Board › Boards manager…');
check(r.some(t => /Twist/.test(t)), `lists the boards OwnStudio knows (${JSON.stringify(r)})`);
await escape();

[ok, r] = await menuPick(['Lab', 'Reports'], /Report to open/);
check(ok, 'Lab › Reports');
check(r.some(t => /capture/.test(t)), `lists the setup's reports (${JSON.stringify(r)})`);
await escape();

[ok, r] = await menuPick(['File', 'Export', 'Report'], /Report to export/);
check(ok, 'File › Export › Report');
check(r.some(t => /capture/.test(t)), `asks which report to export (${JSON.stringify(r)})`);
await escape();

[ok, r] = await menuPick(['Lab', 'Run procedure'], /Procedure to run/);
check(ok, 'Lab › Run procedure');
check(r.length > 0, `asks which procedure to run (${JSON.stringify(r)})`);
await escape();

const stopDisabled = await (async () => {
    await menu('Lab');
    const d = await app.evaluate(`[...document.querySelectorAll('.lm-Menu .lm-Menu-item')].find(e => e.querySelector('.lm-Menu-itemLabel')?.textContent === 'Stop')?.classList.contains('lm-mod-disabled')`);
    await escape();
    return d;
})();
check(stopDisabled === true, 'Lab › Stop is greyed out while nothing runs');

check(await menu('Help', 'Board datasheet'), 'Help › Board datasheet');
n = await until(notes, t => /datasheet/.test(t));
check(/datasheet/.test(n), `answers ("${n.slice(0, 120)}")`);

console.log(`menus: ${shownLabels.join(', ')}`);
app.close();
process.exit(failures ? 1 : 0);
