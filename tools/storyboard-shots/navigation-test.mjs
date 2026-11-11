// SPDX-License-Identifier: LGPL-2.1-only
// The navigation test (plan U2, first version; Luiz's request): drives the real
// window through every workbench × right-bar tab × bottom tab, forward and back,
// at both canvas levels, then 500 random clicks split between the levels. After
// every click it checks that the window shows what
// a model of it expects, and how long it took to get there (#13's lesson): 95 % of
// the switches within 200 ms, none above 300 ms. The clock starts when the press
// reaches the page and stops at the first frame that shows the expected state.
// U8 adds a part dropped from Parts in each workbench: it lands once, and
// nothing else moves. U9 keeps the inside level and its selected block through
// every switch, and checks that the inspector still describes that block.
//
// Usage: run.sh <port> <setup folder> navigation-test.mjs [file-to-open] [random-clicks] [seed]
// The test changes the setup's canvas (parts are dropped): give it a copy.
import { connect, dropPart, waitForWindow, STATE, sleep } from './cdp.mjs';

const [port, file = 'src/main.cpp', clicksArg = '500', seedArg = '1'] = process.argv.slice(2);
const P95_MS = 200;
const MAX_MS = 300;
const WORKBENCHES = [['design', 'ownstudio.left.design', 'ownstudio.workbench.design'], ['code', 'explorer-view-container', null], ['lab', 'ownstudio.left.lab', 'ownstudio.workbench.lab']];
const RIGHT = ['ownstudio.parts', 'ownstudio.inspector', 'chat-view-widget'];
const BOTTOM = ['ownstudio.canvas', 'terminal-0', 'outputView'];

const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');

// Open a document in the Code workbench and scroll it, so "the centre keeps its place" means something.
async function key(k, modifiers = 0, code = k) {
    for (const type of ['keyDown', 'keyUp']) {
        await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : (k === 'Enter' ? 13 : 0) });
    }
}
await key('p', 2, 'KeyP'); await sleep(1500);
await app.send('Input.insertText', { text: file }); await sleep(4000);
await key('Enter'); await sleep(5000);
const box = await app.evaluate(`(() => { const r = document.querySelector('#theia-main-content-panel .monaco-editor')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
if (box) {
    await app.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: 300 });
    await sleep(800);
}
const first = await app.evaluate(STATE);
const editorId = first.main;
const editorScroll = first.centreScroll;
if (!editorId) { console.error('no editor opened for', file); process.exit(2); }

// The model: what the window must show.
const model = {
    workbench: 'code', leftOpen: true, right: first.right, rightOpen: true, bottom: first.bottom,
    canvasLevel: first.canvasLevel, canvasSelection: first.canvasSelection, inspectorSelection: first.inspectorSelection,
};

function expected() {
    const wb = WORKBENCHES.find(w => w[0] === model.workbench);
    return {
        workbench: model.workbench,
        left: model.leftOpen ? wb[1] : null,
        right: model.rightOpen ? model.right : null,
        bottom: model.bottom,
        main: wb[2] ?? editorId,
        centreScroll: wb[2] ? undefined : editorScroll,
        canvasTint: model.workbench,
        canvasLevel: model.canvasLevel,
        canvasSelection: model.canvasSelection,
        inspectorSelection: model.inspectorSelection,
    };
}

function differences(state, want) {
    const out = [];
    for (const [k, v] of Object.entries(want)) {
        if (v === undefined) { continue; }
        if (state[k] !== v) { out.push(`${k}: ${JSON.stringify(state[k])}, expected ${JSON.stringify(v)}`); }
    }
    return out;
}

const tabSelector = (side, id) => side === 'bottom'
    ? `#theia-bottom-content-panel [id="shell-tab-${id}"]`
    : `.lm-TabBar.theia-app-${side} .lm-TabBar-content [id="shell-tab-${id}"]`;

/** One click: apply it to the model, click the real tab, wait until the window matches. */
async function step(side, id) {
    let toggled = false;
    if (side === 'left') {
        const wb = WORKBENCHES.find(w => w[1] === id);
        toggled = wb[0] === model.workbench;
        if (wb[0] === model.workbench && model.leftOpen) { model.leftOpen = false; }      // Theia: clicking the open panel's tab closes it
        else { model.workbench = wb[0]; model.leftOpen = true; }
    } else if (side === 'right') {
        toggled = id === model.right;
        if (id === model.right && model.rightOpen) { model.rightOpen = false; }
        else { model.right = id; model.rightOpen = true; }
    } else {
        model.bottom = id;
    }
    const want = expected();
    // The clock starts when the press reaches the page, as for a user's click.
    await app.evaluate(`window.__ownstudioT0 = undefined; if (!window.__ownstudioClock) { window.__ownstudioClock = true;
        document.addEventListener('pointerdown', () => { window.__ownstudioT0 = performance.now(); }, true); } true`);
    if (!await app.clickOn(tabSelector(side, id))) { return { side, id, error: 'tab not found' }; }
    const result = await app.evaluate(`new Promise(resolve => {
        const want = ${JSON.stringify(want)};
        const check = () => {
            const t0 = window.__ownstudioT0 ?? performance.now();
            const s = ${STATE};
            const ok = Object.entries(want).every(([k, v]) => v === undefined || v === null && s[k] === null || s[k] === v);
            const dt = performance.now() - t0;
            if (ok || dt > 2000) { resolve({ ok, dt, state: s }); } else { requestAnimationFrame(check); }
        };
        check();
    })`);
    // Let a late switch show itself (#13 landed one switch late): look again after a pause.
    await sleep(40);
    const after = await app.evaluate(STATE);
    const diff = differences(after, want);
    return { side, id, toggled, dt: Math.round(result.dt), ok: result.ok && diff.length === 0, diff: result.ok ? diff : differences(result.state, want) };
}

const failures = [];
const times = [];
const bySide = { left: [], right: [], bottom: [] };
const byTarget = {};
async function run(side, id, label) {
    const r = await step(side, id);
    times.push(r.dt ?? Infinity);
    bySide[side].push(r.dt ?? Infinity);
    const k = `${side} ${id}${r.toggled ? ' (toggle)' : ''}`;
    (byTarget[k] ??= []).push(r.dt ?? Infinity);
    if (!r.ok || r.dt > MAX_MS) {
        failures.push({ label, ...r });
    }
}

// Every combination, forward then back, at each canvas level.
const combos = [];
for (const wb of WORKBENCHES) { for (const right of RIGHT) { for (const bottom of BOTTOM) { combos.push([wb[1], right, bottom]); } } }
async function visit([left, right, bottom], label) {
    // Reach the combination with open panels: a tab that is already shown and open is not clicked (it would close).
    const wb = WORKBENCHES.find(w => w[1] === left);
    if (!(model.workbench === wb[0] && model.leftOpen)) { await run('left', left, label); }
    if (!(model.right === right && model.rightOpen)) { await run('right', right, label); }
    await run('bottom', bottom, label);
}
async function allCombinations(level) {
    for (const c of combos) { await visit(c, `${level} forward ${c.join(' · ')}`); }
    for (const c of [...combos].reverse()) { await visit(c, `${level} back ${c.join(' · ')}`); }
}

// Random clicks, including clicks on a panel that is already open.
let seed = Number(seedArg);
const random = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const all = [...WORKBENCHES.map(w => ['left', w[1]]), ...RIGHT.map(id => ['right', id]), ...BOTTOM.map(id => ['bottom', id])];
async function randomClicks(count, level, offset) {
    for (let i = 0; i < count; i++) {
        const [side, id] = all[random(all.length)];
        await run(side, id, `${level} random #${offset + i + 1} ${side} ${id}`);
    }
}

const randomTotal = Number(clicksArg);
const setupRandom = Math.floor(randomTotal / 2);
await allCombinations('setup');
await randomClicks(setupRandom, 'setup', 0);

// U9: open the board, select Driver, then keep the level, selection and inspector through the same matrix.
if (model.bottom !== BOTTOM[0]) { await run('bottom', BOTTOM[0], 'inside: show canvas'); }
const opened = await app.doubleClickOn('.react-flow__node[data-id="board"]');
await sleep(500);
model.canvasLevel = 'inside';
model.canvasSelection = null;
model.inspectorSelection = null;
const openDiff = opened ? differences(await app.evaluate(STATE), expected()) : ['board node not found'];
if (openDiff.length) { failures.push({ label: 'open the Twist', ok: false, diff: openDiff }); }

const selected = await app.clickOn('.ownstudio-inside-block[data-block="driver"]');
await sleep(300);
model.canvasSelection = 'driver';
model.inspectorSelection = 'Driver';
model.right = RIGHT[1];
model.rightOpen = true;
const selectDiff = selected ? differences(await app.evaluate(STATE), expected()) : ['driver block not found'];
if (selectDiff.length) { failures.push({ label: 'select Driver', ok: false, diff: selectDiff }); }

// The three inspector buttons land in Design, Code and Lab (labelled Tests) without losing the inside selection.
const actions = [];
for (const [button, workbench] of [[1, 'design'], [2, 'code'], [3, 'lab']]) {
    const clicked = await app.clickOn(`[id="ownstudio.inspector"] .ownstudio-inspector-actions button:nth-child(${button})`);
    await sleep(300);
    model.workbench = workbench;
    model.leftOpen = true;
    const diff = clicked ? differences(await app.evaluate(STATE), expected()) : [`inspector action ${button} not found`];
    actions.push({ button, workbench, clicked, diff });
    if (diff.length) { failures.push({ label: `Driver action → ${workbench}`, ok: false, diff }); }
}

await allCombinations('inside');
await randomClicks(randomTotal - setupRandom, 'inside', setupRandom);

// Return to the setup level for U8's drag checks.
if (model.bottom !== BOTTOM[0]) { await run('bottom', BOTTOM[0], 'setup: show canvas'); }
const closed = await app.clickOn('.ownstudio-inside-breadcrumb button');
await sleep(300);
model.canvasLevel = 'setup';
model.canvasSelection = null;
model.inspectorSelection = null;
const closeDiff = closed ? differences(await app.evaluate(STATE), expected()) : ['inside breadcrumb not found'];
if (closeDiff.length) { failures.push({ label: 'close the Twist', ok: false, diff: closeDiff }); }

// U8: a resistor dropped from Parts in each workbench lands on the canvas once; the window does not move.
const drops = [];
for (const wb of WORKBENCHES) {
    if (!(model.workbench === wb[0] && model.leftOpen)) { await run('left', wb[1], `drop: open ${wb[0]}`); }
    if (!(model.right === RIGHT[0] && model.rightOpen)) { await run('right', RIGHT[0], `drop: Parts in ${wb[0]}`); }
    if (model.bottom !== BOTTOM[0]) { await run('bottom', BOTTOM[0], `drop: canvas in ${wb[0]}`); }
    const before = await app.evaluate(STATE);
    const count = await app.evaluate(`Number(document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas')?.dataset.nodeCount)`);
    await dropPart(app, 'resistor', 0.3 + 0.2 * drops.length, 0.75);
    await sleep(300);       // React draws the new node on its next render
    const after = await app.evaluate(`Number(document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas')?.dataset.nodeCount)`);
    const state = await app.evaluate(STATE);
    const moved = differences(state, { workbench: before.workbench, left: before.left, right: before.right, bottom: before.bottom, main: before.main, centreScroll: before.centreScroll });
    const ok = after === count + 1 && moved.length === 0;
    drops.push({ workbench: wb[0], before: count, after, ok, moved });
    if (!ok) { failures.push({ label: `drop in ${wb[0]}`, ok, diff: moved, count, after }); }
}

times.sort((a, b) => a - b);
const report = {
    clicks: times.length,
    failures: failures.length,
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    maxMs: times[times.length - 1],
    bySide: Object.fromEntries(Object.entries(bySide).map(([k, v]) => { v.sort((a, b) => a - b); return [k, { median: v[v.length >> 1], p95: v[Math.floor(v.length * 0.95)], max: v[v.length - 1] }]; })),
    byTarget: process.env.NAV_DETAIL ? Object.fromEntries(Object.entries(byTarget).map(([k, v]) => { v.sort((a, b) => a - b); return [k, `n=${v.length} median=${v[v.length >> 1]} max=${v[v.length - 1]}`]; })) : undefined,
    inside: { opened: !!opened, selected: !!selected, closed: !!closed, openDiff, selectDiff, actions, closeDiff },
    drops,
    firstFailures: failures.slice(0, 10),
};
report.pass = failures.length === 0 && report.p95Ms <= P95_MS;
console.log(JSON.stringify(report, null, 1));
app.close();
process.exit(report.pass ? 0 : 1);
