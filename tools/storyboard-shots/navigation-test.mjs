// SPDX-License-Identifier: LGPL-2.1-only
// The navigation test (plan U2, first version; Luiz's request): drives the real
// window through every workbench × right-bar tab × bottom tab, forward and back,
// then 500 random clicks. After every click it checks that the window shows what
// a model of it expects, and how long it took to get there (#13's lesson): 95 % of
// the switches within 200 ms, none above 300 ms. The clock starts when the press
// reaches the page and stops at the first frame that shows the expected state.
// Later commits extend it: canvas levels and selection (U9), dragging parts (U8).
//
// Usage: run.sh <port> <folder> navigation-test.mjs [file-to-open] [random-clicks] [seed]
import { connect, waitForWindow, STATE, sleep } from './cdp.mjs';

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
const model = { workbench: 'code', leftOpen: true, right: first.right, rightOpen: true, bottom: first.bottom };

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

// Every combination, forward then back.
const combos = [];
for (const wb of WORKBENCHES) { for (const right of RIGHT) { for (const bottom of BOTTOM) { combos.push([wb[1], right, bottom]); } } }
async function visit([left, right, bottom], label) {
    // Reach the combination with open panels: a tab that is already shown and open is not clicked (it would close).
    const wb = WORKBENCHES.find(w => w[1] === left);
    if (!(model.workbench === wb[0] && model.leftOpen)) { await run('left', left, label); }
    if (!(model.right === right && model.rightOpen)) { await run('right', right, label); }
    await run('bottom', bottom, label);
}
for (const c of combos) { await visit(c, 'forward ' + c.join(' · ')); }
for (const c of [...combos].reverse()) { await visit(c, 'back ' + c.join(' · ')); }

// Random clicks, including clicks on a panel that is already open.
let seed = Number(seedArg);
const random = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const all = [...WORKBENCHES.map(w => ['left', w[1]]), ...RIGHT.map(id => ['right', id]), ...BOTTOM.map(id => ['bottom', id])];
for (let i = 0; i < Number(clicksArg); i++) {
    const [side, id] = all[random(all.length)];
    await run(side, id, `random #${i + 1} ${side} ${id}`);
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
    firstFailures: failures.slice(0, 10),
};
report.pass = failures.length === 0 && report.p95Ms <= P95_MS;
console.log(JSON.stringify(report, null, 1));
app.close();
process.exit(report.pass ? 0 : 1);
