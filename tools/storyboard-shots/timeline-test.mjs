// SPDX-License-Identifier: LGPL-2.1-only
// U18 end-to-end gate (frame 14, S7). In the real window: two design changes
// (L on the canvas, Kp in control.cpp) and a build make three dots; the dot
// before them previews both files; Restore here brings back the old canvas and
// the old code (in the open editor too); Back to latest returns; 200 restores
// and returns each land within 2 s with no new branch; an edit made from a
// restored dot starts a branch and the strip follows it.
// Usage: run.sh <port> <setup> timeline-test.mjs <setup>  (setup from make-setup: L 33 µH, Kp 0.000215)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port, setupArg, cyclesArg] = process.argv.slice(2);
const setup = setupArg || process.env.OWNSTUDIO_STORYBOARD_SETUP;
const cycles = Number(cyclesArg || 100);
const python = process.env.OWNSTUDIO_PYTHON || '/data/ownstudio/build/venv-mission/bin/python';
const git = (...args) => execFileSync('git', ['-C', setup, ...args], { encoding: 'utf8' }).trim();
const branches = () => git('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').sort();
const control = path.join(setup, 'src', 'control.cpp');
const kpInFile = () => /static const float kp = ([^F;]+)F;/.exec(fs.readFileSync(control, 'utf8'))?.[1];

const app = await connect(port);
const exceptions = [];
await app.send('Runtime.enable');
app.on('Runtime.exceptionThrown', e => exceptions.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
await waitForWindow(app);
await sleep(3000);
const failures = [];
const waitFor = async (expression, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const value = await app.evaluate(expression).catch(() => undefined);
        if (value) return value;
        await sleep(20);
    }
    return undefined;
};
const key = async (k, code = k, vk = 0, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: vk });
};
const typeInto = async (selector, text) => {
    const found = await app.evaluate(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; i.focus(); i.select(); return true; })()`);
    if (!found) {
        failures.push(`${selector} not found`);
        if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, `timeline-missing-${failures.length}.png`), await app.screenshot());
        return;
    }
    await app.send('Input.insertText', { text });
    await key('Enter', 'Enter', 13);
};
const dotCount = `Number(document.querySelector('.ownstudio-timeline-body')?.dataset.dots ?? 0)`;
const boardL = `document.querySelector('.react-flow__node[data-id="board"] [data-value="inductance_H"] b')?.textContent ?? ''`;

// 1. The setup's starting dot, then three changes.
await waitFor(`${dotCount} >= 3`);
const startDots = await app.evaluate(dotCount);
const before = git('rev-parse', 'HEAD');
await app.clickOn('[id="shell-tab-ownstudio.canvas"]');
await app.clickOn('[id="shell-tab-ownstudio.left.design"]');
await waitFor(`!!document.querySelector('[data-sheet="output_filter"] [data-result="ripple_v"]')`);
await typeInto('[data-field="L"] input.ownstudio-number', '47u');
if (!await waitFor(`/47 µH/.test(${boardL}) && ${dotCount} >= ${startDots + 1}`)) failures.push('the L change did not become a dot');
await app.clickOn('.ownstudio-sheet-item[data-sheet="control_loop"]');
await waitFor(`!!document.querySelector('[data-field="kp"] input.ownstudio-number')`);
await typeInto('[data-field="kp"] input.ownstudio-number', '0.0005');
await waitFor(`document.querySelector('[data-action="apply"]')?.disabled === false`);
await app.clickOn('[data-action="apply"]');
if (!await waitFor(`${dotCount} >= ${startDots + 2}`)) failures.push('Apply did not become a dot');
// A build made outside the window (as the toolbar's service would): the strip must notice it.
execFileSync(python, ['-m', 'ownstudio_lab.setups', 'event', setup, 'build', 'Build test ✓']);
if (!await waitFor(`${dotCount} >= ${startDots + 3}`, 6000)) failures.push('an outside build dot did not reach the strip within 6 s');
const latest = git('rev-parse', 'HEAD');

// Open control.cpp in an editor: a restore must reach it too.
await app.clickOn('[id="shell-tab-ownstudio.left.code"]');
await key('p', 'KeyP', 80, 2); await sleep(1000);
await app.send('Input.insertText', { text: 'src/control.cpp' }); await sleep(2000);
await key('Enter', 'Enter', 13); await sleep(2500);
const editorKp = `(() => { const lines = [...document.querySelectorAll('#theia-main-content-panel .monaco-editor .view-line')].map(l => l.textContent.replace(/\\u00a0/g, ' '));
    return /static const float kp = ([^F;]+)F;/.exec(lines.join('\\n'))?.[1] ?? null; })()`;

// 2. Preview the dot before the changes.
await app.clickOn(`.ownstudio-timeline-dot[data-commit="${before}"]`);
const preview = await waitFor(`(() => { const p = document.querySelector('[data-preview="${before}"]'); return p && p.innerText; })()`);
if (!preview) failures.push('the preview of the earlier dot did not open');
else {
    if (!preview.includes('src/control.cpp') || !preview.includes('ownstudio/setup.yaml')) failures.push('the preview does not list both changed files');
    if (!/- *static const float kp = 0\.000215F;/.test(preview)) failures.push('the preview diff does not show the old Kp');
}

// 3. Restore, check every view, come back.
const restoreOnce = async () => {
    const t = Date.now();
    await app.clickOn('[data-preview] [data-action="restore"]');
    const ok = await waitFor(`/33 µH/.test(${boardL}) && document.querySelector('.ownstudio-timeline-body')?.dataset.head === '${before}'`, 5000);
    return { ok: !!ok, ms: Date.now() - t };
};
const backOnce = async () => {
    const t = Date.now();
    await app.clickOn('.ownstudio-timeline-back');
    const ok = await waitFor(`/47 µH/.test(${boardL}) && document.querySelector('.ownstudio-timeline-body')?.dataset.head === '${latest}'`, 5000);
    return { ok: !!ok, ms: Date.now() - t };
};
const first = await restoreOnce();
if (!first.ok) failures.push('Restore here did not bring back 33 µH on the canvas');
if (kpInFile() !== '0.000215') failures.push(`after the restore control.cpp has kp ${kpInFile()}`);
await app.clickOn('#theia-main-content-panel .lm-TabBar-tab[id*="control.cpp"]');
const editorAfter = await waitFor(`(${editorKp}) === '0.000215' && (${editorKp})`, 5000);
await app.clickOn('#theia-main-content-panel .lm-TabBar-tab[id*="ownstudio.timeline.preview"]');
await sleep(300);
if (!editorAfter) failures.push(`the open editor still shows kp ${await app.evaluate(editorKp)} (tabs: ${await app.evaluate(`[...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tab')].map(t => t.id + '|' + t.title).join(', ')`)})`);
const firstBack = await backOnce();
if (!firstBack.ok) failures.push('Back to latest did not return to 47 µH');
if (kpInFile() !== '0.0005') failures.push(`after Back control.cpp has kp ${kpInFile()}`);

// 4. 200 moves, each within 2 s.
const branchesBefore = branches();
const times = [];
let wrong = 0;
for (let i = 0; i < cycles; i++) {
    for (const move of [restoreOnce, backOnce]) {
        const r = await move();
        times.push(r.ms);
        if (!r.ok) wrong++;
    }
}
times.sort((a, b) => a - b);
const slowest = times[times.length - 1];
if (wrong) failures.push(`${wrong} of ${times.length} moves did not land`);
if (slowest > 2000) failures.push(`the slowest move took ${slowest} ms (limit 2000 ms)`);
if (JSON.stringify(branches()) !== JSON.stringify(branchesBefore)) failures.push(`back and forth made branches: ${branches().join(', ')}`);
if (git('status', '--porcelain')) failures.push(`the setup is not clean after the moves:\n${git('status', '--porcelain')}`);

// 5. An edit from a restored dot starts a branch; the strip follows it.
await restoreOnce();
await key('1', 'Digit1', 49, 2);   // Ctrl+1: the Design workbench (a click on its tab would toggle the panel)
await sleep(800);
await app.clickOn('.ownstudio-sheet-item[data-sheet="output_filter"]');
await waitFor(`!!document.querySelector('[data-field="L"] input.ownstudio-number')`);
await typeInto('[data-field="L"] input.ownstudio-number', '22u');
const branchName = `buck-voltage-mode-from-${before.slice(0, 7)}`;
const followed = await waitFor(`document.querySelector('.ownstudio-timeline-branch')?.textContent.includes('${branchName}')`, 8000);
if (!followed) failures.push(`the strip did not follow the new branch ${branchName}`);
if (!branches().includes(branchName)) failures.push(`no branch ${branchName}: ${branches().join(', ')}`);
if (!git('log', '--format=%H', 'buck-voltage-mode').includes(latest)) failures.push('the latest dot of the original branch was lost');
if (exceptions.length) failures.push(`browser exceptions: ${exceptions.join(' | ')}`);

console.log(JSON.stringify({
    startDots, first, firstBack, editorAfter, moves: times.length,
    median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)], slowest,
    branches: branches(), failures,
}, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
