// SPDX-License-Identifier: LGPL-2.1-only
// U1 gate, made runnable for the Theia upgrade: the bundled VS Code extensions
// start. A .cpp opens as C++ and is coloured by the C/C++ grammar, a .py as
// Python, and the git extension's status bar entry shows the branch.
// Usage: run.sh <port> <setup> plugins-test.mjs
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(4000);
const failures = [];

async function key(k, modifiers = 0, code = k) {
    for (const type of ['keyDown', 'keyUp']) {
        await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : (k === 'Enter' ? 13 : 0) });
    }
}
async function open(name) {
    await app.clickOn('[id="shell-tab-ownstudio.left.code"]');
    await sleep(800);
    await key('p', 2, 'KeyP'); await sleep(1200);
    await app.send('Input.insertText', { text: name }); await sleep(2500);
    await key('Enter'); await sleep(3000);
}
const editorState = `(() => {
    const ed = [...document.querySelectorAll('#theia-main-content-panel .monaco-editor')].find(e => e.offsetWidth > 0);
    if (!ed) return null;
    const classes = new Set([...ed.querySelectorAll('.view-lines span[class*="mtk"]')].map(s => s.className));
    const status = [...document.querySelectorAll('#theia-statusBar .element')].map(e => e.textContent.trim());
    return { mode: status.find(t => ['C++', 'C', 'Python', 'Plain Text'].includes(t)) ?? null, colours: classes.size };
})()`;

async function check(file, mode) {
    await open(file);
    let state = null;
    for (let n = 0; n < 40; n++) {
        state = await app.evaluate(editorState);
        if (!state && n === 10) await open(file);   // the first quick-open after start can be swallowed
        if (state?.mode === mode && state.colours > 2) break;
        await sleep(500);
    }
    if (state?.mode !== mode) failures.push(`${file} opened as ${state?.mode}, expected ${mode}`);
    if (!(state?.colours > 2)) failures.push(`${file} has ${state?.colours} token colours: the grammar did not load`);
    return state;
}

const cpp = await check('src/control.cpp', 'C++');
const py = await check('ownstudio/design/output_filter.py', 'Python');
const git = await app.evaluate(`[...document.querySelectorAll('#theia-statusBar .element')].map(e => e.textContent.trim()).filter(t => t.includes('buck-voltage-mode'))`);
if (!git.length) failures.push('no status bar entry shows the branch: the git extension did not start');
console.log(JSON.stringify({ cpp, py, git, failures }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
