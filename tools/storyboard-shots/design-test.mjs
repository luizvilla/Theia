// SPDX-License-Identifier: LGPL-2.1-only
// U16 end-to-end gate (frame 13): in the real window, dragging L on the output
// filter sheet updates the ripple within 0.5 s; releasing it puts L on the Twist
// on the canvas and in setup.yaml with a `design` commit; on the control loop
// sheet a new Kp is tried without writing, then "Apply to the code" writes only
// Kp and Ti into src/control.cpp with another `design` commit.
// Usage: run.sh <port> <setup> design-test.mjs <setup>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port, setupArg] = process.argv.slice(2);
const setup = setupArg || process.env.OWNSTUDIO_STORYBOARD_SETUP;
if (!setup) {
    throw new Error('pass the setup folder to design-test.mjs');
}
const git = (...args) => execFileSync('git', ['-C', setup, ...args], { encoding: 'utf8' }).trim();
const designDots = () => git('log', '--format=%s%x09%(trailers:key=OwnStudio-Event,valueonly,separator=%x2C)').split('\n')
    .filter(line => line.endsWith('\tdesign')).map(line => line.split('\t')[0]);

const app = await connect(port);
const exceptions = [];
await app.send('Runtime.enable');
app.on('Runtime.exceptionThrown', e => exceptions.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
await waitForWindow(app);
await sleep(2500);
const failures = [];
const waitFor = async (expression, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const value = await app.evaluate(expression).catch(() => undefined);
        if (value) {
            return value;
        }
        await sleep(16);
    }
    return undefined;
};

await app.clickOn('[id="shell-tab-ownstudio.left.design"]');
const dotsBefore = designDots();
if (!await waitFor(`!!document.querySelector('[data-sheet="output_filter"] [data-result="ripple_v"]')`)) {
    failures.push('the output filter sheet did not show its ripple');
}
await app.clickOn('[id="shell-tab-ownstudio.canvas"]');
await sleep(500);
const rippleText = `document.querySelector('.ownstudio-sheet-verdict[data-result="ripple_v"] b')?.textContent ?? ''`;
const boardL = `document.querySelector('.react-flow__node[data-id="board"] [data-value="inductance_H"] b')?.textContent ?? ''`;
const before = { ripple: await app.evaluate(rippleText), board: await app.evaluate(boardL) };

// Drag the L slider from where it is to about 47 µH, as a user would.
const box = await app.evaluate(`(() => { const r = document.querySelector('[data-field="L"] input[type=range]').getBoundingClientRect();
    return { x: r.x, y: r.y + r.height / 2, w: r.width }; })()`);
const at = h => box.x + box.w * Math.log(h / 10e-6) / Math.log(15);
await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at(33e-6), y: box.y, button: 'left', clickCount: 1 });
const moved = Date.now();
await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at(47e-6), y: box.y, button: 'left', buttons: 1 });
const changed = await waitFor(`(${rippleText}) !== ${JSON.stringify(before.ripple)} && document.querySelector('.ownstudio-workbench-body[data-sheet]')?.dataset.busy === 'false'`, 3000);
const liveMs = Date.now() - moved;
const during = await app.evaluate(rippleText);
await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at(47e-6), y: box.y, button: 'left', clickCount: 1 });
if (!changed || liveMs > 500) {
    failures.push(`moving L updated the ripple in ${liveMs} ms (limit 500 ms)`);
}

// Released: L reaches the canvas, setup.yaml and a design dot.
const onCanvas = await waitFor(`(${boardL}) !== ${JSON.stringify(before.board)} && (${boardL})`);
let setupL;
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
    const text = fs.readFileSync(path.join(setup, 'ownstudio', 'setup.yaml'), 'utf8');
    setupL = /inductance_H: ([0-9.e-]+)/.exec(text)?.[1];
    if (setupL && designDots().length > dotsBefore.length) {
        break;
    }
    await sleep(200);
}
const lValue = Number(setupL);
if (!(lValue > 40e-6 && lValue < 55e-6)) failures.push(`setup.yaml has L = ${setupL}, expected about 47 µH`);
if (!onCanvas || !/µH/.test(onCanvas)) failures.push(`the Twist on the canvas shows ${JSON.stringify(onCanvas)}`);
const lDot = designDots()[0];
if (!lDot?.startsWith('design: L ')) failures.push(`no design dot for L (latest: ${lDot})`);

// The control loop sheet: try Kp, then apply it.
await app.clickOn('.ownstudio-sheet-item[data-sheet="control_loop"]');
if (!await waitFor(`!!document.querySelector('[data-sheet="control_loop"] [data-result="crossover"]')`)) {
    failures.push('the control loop sheet did not show its margins');
}
const control = path.join(setup, 'src', 'control.cpp');
const cppBefore = fs.readFileSync(control, 'utf8');
const crossover = `document.querySelector('[data-result="crossover"]')?.textContent ?? ''`;
const crossoverBefore = await app.evaluate(crossover);
await app.evaluate(`(() => { const i = document.querySelector('[data-field="kp"] input.ownstudio-number'); i.focus(); i.select(); })()`);
await app.send('Input.insertText', { text: '0.0005' });
await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
const crossoverAfter = await waitFor(`(${crossover}) !== ${JSON.stringify(crossoverBefore)} && (${crossover})`);
if (!crossoverAfter) failures.push('trying Kp = 0.0005 did not move the crossover');
if (fs.readFileSync(control, 'utf8') !== cppBefore) failures.push('trying a gain wrote control.cpp');
const enabled = await waitFor(`document.querySelector('[data-action="apply"]')?.disabled === false`);
if (!enabled) failures.push('Apply to the code stayed disabled after a new Kp');
await app.clickOn('[data-action="apply"]');
let cppAfter = cppBefore;
const applyDeadline = Date.now() + 15000;
while (Date.now() < applyDeadline) {
    cppAfter = fs.readFileSync(control, 'utf8');
    if (cppAfter !== cppBefore && designDots()[0]?.includes('Kp')) {
        break;
    }
    await sleep(200);
}
const diff = cppBefore.split('\n').map((line, i) => [line, cppAfter.split('\n')[i]]).filter(([a, b]) => a !== b);
if (diff.length !== 1 || !diff[0][1]?.includes('kp = 0.0005F')) failures.push(`control.cpp changed as ${JSON.stringify(diff)}`);
if (!designDots()[0]?.includes('Kp 0.0005')) failures.push(`no design dot for the gains (latest: ${designDots()[0]})`);
const disabledAgain = await waitFor(`document.querySelector('[data-action="apply"]')?.disabled === true`);
if (!disabledAgain) failures.push('Apply stayed enabled after the gains were written');
const dirty = git('status', '--porcelain');
if (dirty) failures.push(`the setup is not clean after the design dots:\n${dirty}`);
if (exceptions.length) failures.push(`browser exceptions: ${exceptions.join(' | ')}`);

console.log(JSON.stringify({
    before, during, liveMs, onCanvas, setupL, crossoverBefore, crossoverAfter, diff,
    dots: designDots().slice(0, 3), failures,
}, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
