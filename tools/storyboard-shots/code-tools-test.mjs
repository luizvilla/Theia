// SPDX-License-Identifier: LGPL-2.1-only
// F5 gate (Q177): in the running app, C++ code tools work on a setup's control.cpp with the
// shipped clangd: no download prompt, F12 / Ctrl+click goes to OwnTech's control library, and
// the hover shows its documentation comment. Run it on a built setup (compile_commands.json):
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/code-tools-test.mjs <port>
import { connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(4000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const key = async (k, modifiers = 0, code = k.length === 1 ? `Key${k.toUpperCase()}` : k) => {
    const vk = { Enter: 13, Escape: 27, F12: 123 }[k] ?? k.toUpperCase().charCodeAt(0);
    await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk });
    await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk });
};
const CTRL = 2;
const activeTitle = () => app.evaluate(`document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current.theia-mod-active .lm-TabBar-tabLabel, #theia-main-content-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel')?.textContent ?? ''`);
const goTo = async where => { await key('g', CTRL); await sleep(800); await app.send('Input.insertText', { text: where }); await sleep(500); await key('Enter'); await sleep(800); };
const notifications = () => app.evaluate(`[...document.querySelectorAll('.theia-notification-message, .theia-notification-list-item')].map(e => e.textContent).join(' | ')`);

// Open src/control.cpp from the Explorer, as a user does.
const node = name => app.evaluate(`(() => { const e = [...document.querySelectorAll('.theia-TreeNode')]
    .find(n => n.textContent.trim() === ${JSON.stringify(name)});
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
for (const name of ['src', 'control.cpp']) {
    const at = await node(name);
    if (at) {
        await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await sleep(200);
        await app.click(at.x, at.y);
    }
    await sleep(1500);
}
check((await activeTitle()) === 'control.cpp', `control.cpp is open ("${await activeTitle()}")`);
// Focus the editor, not the Explorer: a click in its text.
const text = await app.evaluate(`(() => { const e = document.querySelector('#theia-main-content-panel .monaco-editor .view-lines'); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.x + 200, y: r.y + 40 }; })()`);
if (text) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: text.x, y: text.y }); await app.click(text.x, text.y); await sleep(500); }
const focused = () => app.evaluate(`!!document.activeElement?.closest('.monaco-editor')`);
check(await focused(), 'the editor has the focus');

// clangd starts and indexes the file: give it time, then look for a download prompt.
await sleep(20000);
const prompts = await notifications();
check(!/clangd.*not found|download and install clangd/i.test(prompts), `no clangd download prompt (${prompts ? `notifications: ${prompts.slice(0, 160)}` : 'no notifications'})`);

// Hover on pid.init (line 27, column 10): the doc comment from pid.h.
await goTo('27:10');
// The mouse rests on "init" in the line "pid.init(params);", as a user hovers.
const word = await app.evaluate(`(() => {
    const line = [...document.querySelectorAll('.monaco-editor .view-line')].find(l => l.textContent.includes('pid.init('));
    if (!line) return null;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent.indexOf('init');
        if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 4); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
    }
    return null; })()`);
let hover = '';
for (let i = 0; i < 10 && word && !/initiali[sz]e the standard pid/i.test(hover); i++) {
    // clangd may still be indexing: move away and back, as a user tries again.
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: word.x - 400, y: word.y });   // off the text: no hover
    await key('Escape');
    await sleep(500);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: word.x, y: word.y });
    await sleep(1700);
    hover = await app.evaluate(`[...document.querySelectorAll('.monaco-hover-content')].map(e => e.textContent).join(' ').trim()`);
}
check(/initiali[sz]e the standard pid/i.test(hover), `the hover shows the library's comment ("${hover.slice(0, 140)}")`);
await key('Escape');

// F12, the same command as Ctrl+click: pid.init goes to OwnTech's control library.
if (text) { await app.click(text.x, text.y); await sleep(300); }
await goTo('27:10');
const cursor = await app.evaluate(`document.querySelector('#theia-statusBar')?.textContent.match(/Ln \\d+, Col \\d+/)?.[0] ?? ''`);
check(cursor === 'Ln 27, Col 10', `the cursor is on pid.init ("${cursor}")`);
await key('F12');
let title = '';
for (let i = 0; i < 15; i++) {
    await sleep(1000);
    title = await activeTitle();
    if (title && title !== 'control.cpp') { break; }
}
check(/^pid\.(h|cpp)$/.test(title), `go to definition opens the library ("${title}")`);

// app.conf and app.ini are coloured as ini files, not plain white text.
for (const name of ['app.conf', 'app.ini']) {
    const at = await node(name);
    if (at) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await sleep(200); await app.click(at.x, at.y); }
    await sleep(2000);
    const tokens = await app.evaluate(`new Set([...document.querySelectorAll('#theia-main-content-panel .monaco-editor .view-line span span')].map(s => getComputedStyle(s).color)).size`);
    // Plain text is one colour; the ini grammar colours sections, keys and values.
    check((await activeTitle()) === name && tokens > 1, `${name} opens coloured (${tokens} colours)`);
    if (process.env.SHOT_DIR) { (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/${name}.png`, await app.screenshot()); }
}

app.close();
process.exit(failures ? 1 : 0);
