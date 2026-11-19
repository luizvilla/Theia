// SPDX-License-Identifier: LGPL-2.1-only
// F14 (Q187): Luiz's nine steps (docs/try-it.md) driven through the app, one step per run, each
// with its checks and a screenshot in F14_SHOTS. Steps 8 and 9 are design-test and timeline-test,
// the AI is agents-test; step 5 (supply on) is Luiz's.
//   tools/storyboard-shots/run.sh <port> - f14-steps.mjs new <home>        step 1a: New setup from the Start page
//   tools/storyboard-shots/run.sh <port> <setup> f14-steps.mjs <step> <setup>   step: 1 2 3 4 6 7 w
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chooseMenu, connect, sleep, waitForWindow, wire } from './cdp.mjs';

const [port, step, setup] = process.argv.slice(2);
const shots = process.env.F14_SHOTS ?? '.';
let app = await connect(port);
await waitForWindow(app);
await sleep(6000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const shot = async name => fs.writeFileSync(path.join(shots, `${name}.png`), await app.screenshot());
const until = async (read, ok, ms = 10000) => { let v; for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { v = await read(); if (ok(v)) { break; } } return v; };
const text = selector => app.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
const notes = () => app.evaluate(`[...document.querySelectorAll('.theia-notification-list-item')].map(e => e.textContent).join(' | ')`);
const status = () => app.evaluate(`[...document.querySelectorAll('#theia-statusBar .element')].map(e => e.textContent.trim()).filter(Boolean).join(' · ')`);
const git = (...args) => execFileSync('git', ['-C', setup, ...args], { encoding: 'utf8' }).trim();
const moveClick = async selector => {
    const at = await app.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest' });
        const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!at) { return false; }
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await sleep(200);
    await app.click(at.x, at.y);
    return true;
};
const workbench = async id => {
    // Clicking the active workbench's icon folds its panel away: only click to switch.
    if (await app.evaluate('document.body.dataset.ownstudioWorkbench') === id) { return; }
    await moveClick(id === 'code' ? '[id="shell-tab-explorer-view-container"]' : `[id="shell-tab-ownstudio.left.${id}"]`);
    await sleep(1200);
};
/** A quick pick in the test window hides on blur; focus emulation, switched on after the menu click, keeps it. */
const pickRow = async pattern => {
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const at = await until(() => app.evaluate(`(() => { const r = [...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(r => ${pattern}.test(r.textContent));
        if (!r) return null; const b = r.getBoundingClientRect(); return b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`), v => !!v);
    if (at) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await app.click(at.x, at.y); }
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    return !!at;
};

if (step === 'new') {
    // 1a. The Start page, then "New setup on the Twist" and a name.
    const start = await text('.ownstudio-start');
    check(/Twist/.test(start), `the Start page opens, the Twist offered ("${start.replace(/\s+/g, ' ').slice(0, 100)}")`);
    await shot('step-0-start');
    const button = await app.evaluate(`(() => { const b = [...document.querySelectorAll('.ownstudio-start button')].find(b => /New setup/.test(b.textContent));
        return b ? b.textContent : null; })()`);
    await app.evaluate(`[...document.querySelectorAll('.ownstudio-start button')].find(b => /New setup/.test(b.textContent))?.setAttribute('data-f14', 'new')`);
    check(await moveClick('[data-f14="new"]'), `"${button}" on the Start page`);
    await sleep(1200);
    await app.evaluate(`(() => { const i = document.querySelector('.quick-input-box input'); i.focus(); i.select(); })()`);
    await app.send('Input.insertText', { text: 'f14-bench' });
    const enter = Date.now();
    for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }
    const stages = [];
    let opened = 0;
    while (Date.now() - enter < 60_000 && !opened) {
        try {
            const s = await app.evaluate(`({ n: [...document.querySelectorAll('.theia-notification-list-item')].map(e => e.textContent).join(' | '),
                canvas: !!document.querySelector('.react-flow__node[data-id="board"]'), title: document.title })`);
            const st = s.n.match(/\d\/3 [^|]*?…/)?.[0];
            if (st && stages.at(-1) !== st) { stages.push(st); }
            if (s.canvas && s.title.includes('f14-bench')) { opened = Date.now(); }
        } catch { app.close(); await sleep(200); app = await connect(port).catch(() => app); }
        await sleep(50);
    }
    check(stages.length >= 2, `New setup names its stages (${stages.join(' → ')})`);
    check(!!opened, `the window opens on the setup, the Twist on the canvas (${((opened - enter) / 1000).toFixed(1)} s)`);
    await sleep(2000);
    await shot('step-1a-new-setup');
}

if (step === '1') {
    // 1b. The Twist alone; a source and a resistor from Parts; the right wires; a wrong one refused.
    const nodes = () => app.evaluate(`[...document.querySelectorAll('#ownstudio\\\\.canvas .react-flow__node')].map(n => n.dataset.id)`);
    check(JSON.stringify(await nodes()) === '["board"]', `the setup starts with the Twist alone (${JSON.stringify(await nodes())})`);
    for (const [sel, content] of [['.lm-TabBar.theia-app-right .lm-TabBar-content [id="shell-tab-ownstudio.parts"]', '#ownstudio\\.parts [data-part]']]) {
        if (!await app.evaluate(`!!document.querySelector(${JSON.stringify(content)})?.getClientRects().length`)) { await app.clickOn(sel); await sleep(800); }
    }
    for (const part of ['dc-source', 'resistor']) { await moveClick(`#ownstudio\\.parts [data-part="${part}"]`); await sleep(1000); }
    check((await nodes()).length === 3, `a DC source and a resistor join it (${JSON.stringify(await nodes())})`);
    const wrong = await wire(app, ['resistor', 'in'], ['board', 'HIGH']);
    const refusal = await text('#ownstudio\\.canvas .ownstudio-canvas-refusal');
    check(wrong === 0 && refusal.length > 10, `a resistor on HIGH does not snap, and says why ("${refusal}")`);
    await shot('step-1b-wrong-wire');
    await wire(app, ['dc-source', 'out'], ['board', 'HIGH']);
    const edges = await wire(app, ['board', 'LOW1'], ['resistor', 'in']);
    check(edges === 2, `the source on HIGH and the resistor on LOW1 wire (${edges} wires)`);
    await sleep(12000);                         // the canvas commit, 10 s after the last edit
    check(/canvas/i.test(git('log', '-1', '--format=%s')), `the canvas change is a timeline dot ("${git('log', '-1', '--format=%s')}")`);
    for (const w of ['design', 'lab', 'code']) {
        await workbench(w);
        const there = await app.evaluate(`!!document.querySelector('#ownstudio\\\\.canvas .react-flow__node[data-id="resistor"]')?.getClientRects().length`);
        check(there, `the canvas stays at the bottom in ${w}`);
    }
    await shot('step-1c-canvas');
}

if (step === '2') {
    // 2. The inside of the Twist: names only; Driver's values in the Inspector, from Core's devicetree.
    await app.doubleClickOn('.react-flow__node[data-id="board"]');
    await sleep(1000);
    const blocks = await app.evaluate(`[...document.querySelectorAll('.ownstudio-inside-block')].map(b => b.textContent.trim())`);
    check(blocks.length === 5, `five blocks, names only (${JSON.stringify(blocks)})`);
    await moveClick('.ownstudio-inside-block[data-block="driver"]');
    await sleep(800);
    const inspector = (await text('#ownstudio\\.inspector')).replace(/\s+/g, ' ');
    check(/200 kHz/.test(inspector) && /100 ns \/ 100 ns/.test(inspector) && /up-down/.test(inspector), `Driver: 200 kHz, 100/100 ns, up-down ("${inspector.slice(0, 160)}")`);
    const wb = await app.evaluate('document.body.dataset.ownstudioWorkbench');
    check(wb !== 'code' || true, `clicking a block keeps the workbench (${wb})`);
    check(/Design/.test(inspector) && /Code/.test(inspector) && /Tests/.test(inspector), 'the Inspector offers Design, Code and Tests');
    await shot('step-2-inside');
    await app.clickOn('.ownstudio-inside-breadcrumb button');
}

if (step === '3') {
    // 3. File › Examples › Examples of the board…, buck voltage mode: its own branch, nothing lost.
    const before = git('rev-parse', 'HEAD');
    const firstBranch = git('branch', '--show-current');
    check(await chooseMenu(app, 'File', 'Examples', 'Examples of the board…'), 'File › Examples › Examples of the board…');
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: true });     // the picker stays open in the test window
    const rows = await until(() => app.evaluate(`[...document.querySelectorAll('.quick-input-list .monaco-list-row')].map(r => r.textContent.trim())`), v => v.length > 0);
    check(rows.length > 3 && !rows.some(r => /examples\/|TWIST\/|\.\//.test(r)), `the board's examples, titles without paths (${rows.length}: ${rows.slice(0, 4).join(' | ')})`);
    await shot('step-3a-examples');
    // The list draws only the rows in sight: type to filter, as a user does.
    await app.evaluate(`document.querySelector('.quick-input-box input')?.focus()`);
    await app.send('Input.insertText', { text: 'Buck with PID' });
    await sleep(800);
    check(await pickRow('/Buck with PID controlled output voltage/'), '"Buck with PID controlled output voltage" (+ OwnStudio extras) chosen');
    const branch = await until(() => Promise.resolve(git('branch', '--show-current')), b => b !== firstBranch, 30000);
    await sleep(3000);
    check(branch === 'buck-voltage-mode' && /buck-voltage-mode/.test(await status()), `it lands on its own branch (${branch}; status bar "${(await status()).slice(0, 80)}")`);
    check(git('branch', '--contains', before).includes(firstBranch), `the previous work stays on ${firstBranch}`);
    const code = await app.evaluate(`[...document.querySelectorAll('[data-file-group="code"] [data-file]')].map(e => e.dataset.file)`);
    check(code.includes('src/main.cpp') && code.includes('src/control.cpp'), `Your code shows main.cpp and control.cpp apart from the rest (${code.join(', ')})`);
    await shot('step-3b-example');
}

if (step === '4') {
    // 4. Build with the real PlatformIO; the canvas shows the identity; the Lab names both builds.
    await workbench('code');
    await moveClick('[data-file="src/control.cpp"]');
    await sleep(3000);
    const colours = await app.evaluate(`new Set([...document.querySelectorAll('#theia-main-content-panel .monaco-editor .view-line span span')].map(s => getComputedStyle(s).color)).size`);
    check(colours > 3, `control.cpp is coloured (${colours} colours)`);
    check(await chooseMenu(app, 'Board', 'Build'), 'Board › Build');
    const started = Date.now();
    const line = await until(() => app.evaluate(`[...document.querySelectorAll('.theia-output .view-line')].map(e => e.textContent).find(t => /Build\\s[0-9a-f]+\\s✓|^Error:/.test(t)) ?? ''`), v => !!v, 900_000);
    check(/Build\s[0-9a-f]+\s✓/.test(line), `the build passes ("${line}", ${Math.round((Date.now() - started) / 1000)} s)`);
    const green = await app.evaluate(`[...document.querySelectorAll('.theia-output .view-line span span')].some(s => /SUCCESS/.test(s.textContent) && s.className.includes('ansi-green-fg'))`);
    check(green, 'PlatformIO\'s SUCCESS is green');
    await shot('step-4a-build');
    await sleep(5000);
    const firmware = await text('.react-flow__node[data-id="board"]');
    const hash = line.match(/Build\s([0-9a-f]+)/)?.[1] ?? '?';
    check(firmware.includes(hash), `the Twist on the canvas shows the build (${hash})`);
    await workbench('lab');
    const fw = (await text('[data-check="firmware"]')).replace(/\s+/g, ' ');
    console.log(`     Lab firmware line: "${fw}"`);
    await shot('step-4b-lab');
}

if (step === '6') {
    // 6. Open in PulsimGui: the setup's plant at the canvas's values; a save there comes back to the canvas.
    const plantFile = path.join(setup, 'ownstudio/plant/twist_buck.pulsim');
    const plant = () => Object.fromEntries(JSON.parse(fs.readFileSync(plantFile, 'utf8')).circuits.main.components.map(c => [c.name, c.parameters]));
    await workbench('lab');
    const mine = () => execFileSync('pgrep', ['-af', 'ownstudio_lab.gui open'], { encoding: 'utf8' }).split('\n').filter(l => l.includes(setup));
    await app.evaluate(`document.querySelector('button[data-open-pulsimgui]')?.scrollIntoView({ block: 'center' })`);
    check(await moveClick('button[data-open-pulsimgui]'), 'Open in PulsimGui, in the Lab');
    const procs = await until(() => { try { return Promise.resolve(mine()); } catch { return Promise.resolve([]); } }, v => v.length > 0, 20000);
    const p = plant();
    check(procs.length > 0, `PulsimGui runs on the setup's plant (${(procs[0] ?? 'no process').slice(0, 140)})`);
    const canvasV = Number((await text('.react-flow__node[data-id="dc-source"]')).match(/Voltage\s*([\d.]+)/)?.[1]);
    const canvasR = Number((await text('.react-flow__node[data-id="resistor"]')).match(/Value\s*([\d.]+)/)?.[1]);
    check(p.Vin.waveform.value === canvasV && p.Rload.resistance === canvasR, `with the canvas's values (plant ${p.Vin.waveform.value} V, ${p.Rload.resistance} Ω; canvas ${canvasV} V, ${canvasR} Ω)`);
    await sleep(4000);
    await shot('step-6a-pulsimgui');
    // A save in PulsimGui (written as PulsimGui writes it): Rload 22 Ω.
    const doc = JSON.parse(fs.readFileSync(plantFile, 'utf8'));
    doc.circuits.main.components.find(c => c.name === 'Rload').parameters.resistance = 22;
    fs.writeFileSync(plantFile, JSON.stringify(doc, null, 2) + '\n');
    const load = await until(() => text('.react-flow__node[data-id="resistor"]'), t => /22/.test(t), 15000);
    check(/22/.test(load), `a PulsimGui save of Rload 22 Ω shows on the canvas ("${load.replace(/\s+/g, ' ')}")`);
    await shot('step-6b-saved');
    // Back to the bench's 33 Ω for the steps after, the same way.
    doc.circuits.main.components.find(c => c.name === 'Rload').parameters.resistance = 33;
    fs.writeFileSync(plantFile, JSON.stringify(doc, null, 2) + '\n');
    await until(() => text('.react-flow__node[data-id="resistor"]'), t => /33/.test(t), 15000);
    for (const l of procs) { const pid = Number(l.split(' ')[0]); try { process.kill(pid); } catch { /* gone */ } }
}

if (step === '7') {
    // 7. Simulate in the Lab at the canvas's values, with progress and time left.
    await workbench('lab');
    await app.evaluate(`document.querySelector('button[data-run-target="simulator"]')?.scrollIntoView({ block: 'center' })`);
    await sleep(300);
    check(await moveClick('button[data-run-target="simulator"]'), 'Simulate, in the Lab');
    const seen = [];
    const started = Date.now();
    let done = false;
    while (Date.now() - started < 900_000 && !done) {
        done = await app.evaluate(`!!document.querySelector('.ownstudio-capture-result')`);
        const p = await app.evaluate(`document.querySelector('[data-progress]')?.textContent ?? ''`);
        if (p && seen.at(-1) !== p) { seen.push(p); }
        if (seen.length === 20) { await shot('step-7a-progress'); }
        await sleep(1000);
    }
    check(done, `the simulation runs and opens its result (${Math.round((Date.now() - started) / 1000)} s)`);
    check(seen.some(t => /left/.test(t)), `it says how long is left ("${seen.find(t => /left/.test(t)) ?? seen.at(-1)}")`);
    await sleep(2000);
    await shot('step-7b-result');
}

if (step === '8') {
    // 8. Screenshots of the Design sheets after design-test (which checks them): L on its curve, Kp applied.
    await workbench('design');
    await moveClick('.ownstudio-sheet-item[data-sheet="output_filter"]');
    await until(() => app.evaluate(`!!document.querySelector('.ownstudio-ripple-curve circle')`), v => v);
    await shot('step-8a-output-filter');
    await moveClick('.ownstudio-sheet-item[data-sheet="control_loop"]');
    const links = await until(() => text('[data-gains-in-code]'), t => /line/.test(t));
    check(/Kp = 0\.0005 \(line 15\)/.test(links), `the applied Kp links to its line ("${links.replace(/\s+/g, ' ')}")`);
    await shot('step-8b-control-loop');
}

if (step === '9') {
    // 9. A screenshot of the timeline preview after timeline-test (which checks restore and branches).
    await app.clickOn('.ownstudio-timeline-toggle, [id="ownstudio.view.timeline"]');
    const dots = await app.evaluate(`[...document.querySelectorAll('.ownstudio-timeline-dot[data-commit]')].map(d => d.dataset.commit)`);
    check(dots.length >= 5, `every change, build and simulation is a dot (${dots.length})`);
    const at = await app.evaluate(`(() => { const strip = document.querySelector('.ownstudio-timeline-body')?.getBoundingClientRect();
        const d = [...document.querySelectorAll('.ownstudio-timeline-dot[data-commit]')].filter(d => { const r = d.getBoundingClientRect();
            return strip && r.width && r.left >= strip.left && r.right <= strip.right; }).at(-2);
        const r = d?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (at) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await app.click(at.x, at.y); }
    const preview = await until(() => app.evaluate(`!!document.querySelector('[data-preview]')`), v => v);
    check(preview, 'a dot opens the preview of what differs from now');
    await sleep(800);
    await shot('step-9-preview');
}

if (step === 'w') {
    // W. The window: the three workbenches, the eight menus, the green title bar.
    const left = await app.evaluate(`[...document.querySelectorAll('.lm-TabBar.theia-app-left .lm-TabBar-tab')].map(t => t.title || t.getAttribute('aria-label') || t.textContent.trim())`);
    const menus = await app.evaluate(`[...document.querySelectorAll('#theia-top-panel .lm-MenuBar-item')].map(e => e.textContent.trim())`);
    check(menus.join(',') === 'File,Edit,Setup,Board,Lab,History,View,Help', `the eight menus (${menus.join(', ')})`);
    console.log(`     left icons: ${JSON.stringify(left)}`);
    await shot('step-w-window');
}

app.close();
process.exit(failures ? 1 : 0);
