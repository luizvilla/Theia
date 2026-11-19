// SPDX-License-Identifier: LGPL-2.1-only
// F12 gate (Q184): Git Graph comes with OwnStudio. "Git Graph: View Git Graph" from the command
// palette opens its tab, and the graph lists the setup's commits (the timeline's dots).
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/gitgraph-test.mjs <setup>
import { execFileSync } from 'node:child_process';
import { connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(5000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const key = async (k, modifiers = 0, code = k, vk = 0) => {
    for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: vk }); }
};

// The command palette: Ctrl+Shift+P.
// The first opening after start can come up late: type again until the text is in.
for (let i = 0; i < 5 && !await app.evaluate(`/View Git Graph/.test(document.querySelector('.quick-input-box input')?.value ?? '')`); i++) {
    if (!await app.evaluate(`!!document.querySelector('.quick-input-widget:not([style*="display: none"]) .quick-input-box input')`)) {
        await key('P', 2 | 8, 'KeyP', 80);
        await sleep(1500);
    }
    await app.evaluate(`(() => { const i = document.querySelector('.quick-input-box input'); i?.focus(); if (i) { i.value = '>'; } })()`);
    await app.send('Input.insertText', { text: 'View Git Graph' });
    await sleep(1500);
}
const offered = await app.evaluate(`[...document.querySelectorAll('.quick-input-list .monaco-list-row')].map(r => r.textContent.trim()).slice(0, 4)`);
check(offered.some(t => /View Git Graph/.test(t)), `the palette offers "Git Graph: View Git Graph" (${JSON.stringify(offered)})`);
// A click on the offered row, as a user does (the keyboard focus may still be in the Explorer).
const row = await app.evaluate(`(() => { const r = [...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(r => /View Git Graph/.test(r.textContent));
    if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
if (row) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.x, y: row.y }); await app.click(row.x, row.y); }
await sleep(3000);
if (!await app.evaluate(`[...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tabLabel')].some(e => /Git Graph/.test(e.textContent))`)) {
    console.log('the palette did not open it; trying its status bar entry');
    const item = await app.evaluate(`(() => { const e = [...document.querySelectorAll('#theia-statusBar .element')].find(e => e.textContent.trim() === 'Git Graph');
        if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (item) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: item.x, y: item.y }); await app.click(item.x, item.y); }
}

let tab = '';
for (let i = 0; i < 30 && !tab; i++) {
    await sleep(500);
    tab = await app.evaluate(`[...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tab .lm-TabBar-tabLabel')].map(e => e.textContent).find(t => /Git Graph/.test(t)) ?? ''`);
}
check(!!tab, `its tab opens ("${tab}")`);

// The graph lives in the webview's frame, a target of its own.
const subject = execFileSync('git', ['-C', setup, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
let rows = [];
for (let i = 0; i < 40 && !rows.some(r => r.includes(subject)); i++) {
    await sleep(500);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    for (const t of targets.filter(t => t.type === 'iframe' && t.webSocketDebuggerUrl)) {
        const frame = await connect(port, t.id).catch(() => null);
        if (!frame) { continue; }
        // Theia's webview frame holds the extension's page in a frame of its own (same origin).
        const found = await frame.evaluate(`[...document.querySelectorAll('iframe')].flatMap(f => [...(f.contentDocument?.querySelectorAll('#commitTable tr.commit') ?? [])]).map(e => e.textContent)`).catch(() => []);
        frame.close();
        if (found?.length) { rows = found; break; }
    }
}
check(rows.some(r => r.includes(subject)), `the graph lists the setup's commits (${rows.length} rows; the latest "${subject}")`);
if (process.env.SHOT_DIR) { (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/git-graph.png`, await app.screenshot()); }

app.close();
process.exit(failures ? 1 : 0);
