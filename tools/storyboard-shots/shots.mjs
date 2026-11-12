// SPDX-License-Identifier: LGPL-2.1-only
// Storyboard shots (plan, "every commit that changes the window is checked against
// the storyboards"): drives OwnStudio into the state of each storyboard frame built
// so far and saves a screenshot beside its frame number in docs/images/step-5/.
// Each commit that builds a frame adds it to FRAMES.
//
// Usage: run.sh <port> <setup folder> shots.mjs [only-frame-id]   (frames on a setup; they change its canvas: give it a copy)
//        run.sh <port> - shots.mjs                               (frames without a folder: Start)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, dropPart, waitForWindow, wire, STATE, sleep } from './cdp.mjs';

const [port, only] = process.argv.slice(2);
const out = join(dirname(fileURLToPath(import.meta.url)), '../../docs/images/step-5');
mkdirSync(out, { recursive: true });

const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');
await app.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 960, deviceScaleFactor: 1, mobile: false });
await sleep(1000);

async function key(k, modifiers = 0, code = k) {
    for (const type of ['keyDown', 'keyUp']) {
        await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : (k === 'Enter' ? 13 : 0) });
    }
}
async function openFile(name) {
    await key('p', 2, 'KeyP'); await sleep(1500);
    await app.send('Input.insertText', { text: name }); await sleep(4000);
    await key('Enter'); await sleep(4000);
}
const tab = (side, id) => side === 'bottom'
    ? `#theia-bottom-content-panel [id="shell-tab-${id}"]`
    : `.lm-TabBar.theia-app-${side} .lm-TabBar-content [id="shell-tab-${id}"]`;
async function show(side, id) {
    const state = await app.evaluate(STATE);
    const current = side === 'left' ? state.left : side === 'right' ? state.right : state.bottom;
    if (current !== id) { await app.clickOn(tab(side, id)); await sleep(600); }
}

/** The frames built so far: id, storyboard number, how to get there, what differs and why. */
const FRAMES = [
    {
        id: 'anatomy', num: '0', title: 'The window, part by part',
        go: async () => {
            await show('left', 'explorer-view-container');
            await openFile(process.env.SHOT_FILE || 'src/main.cpp');
            await show('right', 'ownstudio.inspector');
            await show('bottom', 'ownstudio.canvas');
        },
        differences: [
            'This first-state capture has the setup\'s Twist only; frames 2 and 3 add and wire its source and load. Timeline dots come in U18.',
            'The Code panel is Theia\'s explorer (open editors, the folder, the git timeline); "My files" and the libraries list come with setups.',
            'The status-bar icons and the Code toolbar run the same Build, Upload and Serial actions; board identity appears when a Twist is connected.',
        ],
    },
    {
        id: 'start', num: '1', title: 'Start: choose a board', noFolder: true,
        go: async () => { await sleep(2500); },
        differences: [
            'The board grid comes from the board descriptions: the Twist (defined), Spin and Ownverter (not yet, "Later"), and Custom board (slice 2).',
            'The connected board is highlighted only when a Spin is plugged in; this shot is taken without one.',
            'Tutorials are listed as after slice 1, as in the frame.',
        ],
    },
    {
        id: 'parts', num: '2', title: 'Drag the source, the Twist and the load',
        go: async () => {
            await show('left', 'ownstudio.left.lab');
            await show('right', 'ownstudio.parts');
            await show('bottom', 'ownstudio.canvas');
            await dropPart(app, 'dc-source', 0.03, 0.45);
            await dropPart(app, 'resistor', 0.78, 0.45);
            await sleep(600);
        },
        differences: [
            'The Lab panel shows what its checklist will check; the checklist itself comes in U11.',
            'The frame shows the resistor mid-drag; this stable check captures the source and resistor after both drops.',
            'The timeline dots come in U18.',
        ],
    },
    {
        id: 'rules', num: '3', title: 'Wire them; a wrong wire does not snap',
        go: async () => {
            await wire(app, ['dc-source', 'out'], ['board', 'HIGH']);
            await wire(app, ['board', 'LOW1'], ['resistor', 'in']);
            await wire(app, ['resistor', 'in'], ['board', 'HIGH']);       // refused: it says why
            await sleep(200);
        },
        differences: [
            'The refusal shows under the canvas for a few seconds; the frame draws it beside the wire.',
            'The timeline dots come in U18.',
        ],
    },
    {
        id: 'inside', num: '4', title: 'Open the Twist and look at its parts',
        go: async () => {
            await app.doubleClickOn('.react-flow__node[data-id="board"]');
            await sleep(500);
            await app.clickOn('.ownstudio-inside-block[data-block="driver"]');
            await show('left', 'ownstudio.left.design');
            await show('right', 'ownstudio.inspector');
            await show('bottom', 'ownstudio.canvas');
            await sleep(300);
        },
        after: async () => { await app.clickOn('.ownstudio-inside-breadcrumb button'); },
        differences: [
            'The Design sheets in the centre arrive in U16; the selected Driver and its devicetree values are complete here.',
            'The requirement badges come when a setup carries requirements, and timeline dots come in U18.',
        ],
    },
    {
        id: 'partscode', num: '6b', title: 'Parts from the Code workbench: nothing else moves',
        go: async () => {
            await show('left', 'explorer-view-container');
            await openFile(process.env.SHOT_FILE || 'src/main.cpp');
            await show('right', 'ownstudio.parts');
            await show('bottom', 'ownstudio.canvas');
            await sleep(400);
        },
        differences: [
            'The canvas keeps the source, Twist and resistor wired in frames 2 and 3; the navigation test checks a drop from every workbench.',
            'The timeline dots come in U18.',
        ],
    },
    {
        id: 'build', num: '7', title: 'Build and flash, with real progress',
        go: async () => {
            await show('left', 'explorer-view-container');
            await openFile(process.env.SHOT_FILE || 'src/main.cpp');
            await show('right', 'ownstudio.inspector');
            const buttons = await app.evaluate(`(() => [...document.querySelectorAll('.theia-tabBar-toolbar .item')]
                .map(e => ({ text: e.textContent?.trim(), title: e.getAttribute('title'), cls: e.className })))()`);
            const clicked = await app.clickOn('[id="toolbar.ownstudio.setup.buildUpload"]');
            if (!clicked) { throw new Error(`Build and upload toolbar button not found: ${JSON.stringify(buttons)}`); }
            await sleep(2300);
        },
        after: async () => {
            await sleep(4000);
            await show('bottom', 'ownstudio.canvas');
        },
        differences: [
            'The screenshot uses deterministic fake PlatformIO and mcumgr processes; the same service is gated below with a real buck build.',
            'Timeline dots are committed now but their strip is drawn in U18.',
        ],
    },
    {
        id: 'checklist', num: '8', title: 'The Lab checks before Run turns green',
        go: async () => {
            await show('left', 'ownstudio.left.lab');
            await show('right', 'ownstudio.inspector');
            await show('bottom', 'ownstudio.canvas');
            await app.clickOn('.react-flow__node[data-id="dc-source"]');
            await sleep(3000);
        },
        differences: [
            'The deterministic storyboard Twist reports HIGH = 0.2 V; all other live checks hold, so the one failing sentence is visible in the panel and on Run.',
            'U12 fills the capture form in the centre; U11 lists its board procedure and enforces the checklist before it can start.',
            'Timeline dots are committed now but their strip is drawn in U18.',
        ],
    },
    {
        id: 'capture', num: '9', title: 'The default capture from the board',
        go: async () => {
            await show('left', 'ownstudio.left.lab');
            await show('right', 'ownstudio.inspector');
            await show('bottom', 'ownstudio.canvas');
            await app.clickOn('.react-flow__node[data-id="dc-source"]');
            await sleep(3500);
        },
        differences: [
            'The channels, reference step and capture window come from the Twist board description; the example adds nothing.',
            'The deterministic storyboard Twist reports the matching firmware and HIGH = 29.9 V, so all six checks hold and Capture is green.',
            'Timeline dots come in U18.',
        ],
    },
    {
        id: 'result', num: '10', title: 'The capture result, opened on the event',
        go: async () => {
            await show('left', 'ownstudio.left.lab');
            for (let n = 0; n < 40 && !await app.evaluate(`document.querySelector('[data-run-target="board"]')?.dataset.ready === 'true'`); n++) await sleep(400);
            await app.evaluate(`document.querySelector('[data-run-target="board"]')?.scrollIntoView({ block: 'center' }); true`);
            await sleep(300);
            const clicked = await app.clickOn('[data-run-target="board"]');
            if (!clicked) { throw new Error('board capture button not found'); }
            await sleep(500);
            const confirmed = await app.evaluate(`(() => { const button = [...document.querySelectorAll('button')]
                .find(e => e.textContent.trim() === 'Switch on and run'); button?.click(); return !!button; })()`);
            if (!confirmed) { throw new Error('power confirmation did not open'); }
            for (let n = 0; n < 50 && !await app.evaluate(`!!document.querySelector('.ownstudio-uplot canvas')`); n++) await sleep(400);
            if (!await app.evaluate(`!!document.querySelector('.ownstudio-uplot canvas')`)) { throw new Error('capture result did not open'); }
            const state = await app.evaluate(STATE);
            if (state.bottom) { await key('j', 2, 'KeyJ'); await sleep(500); }
            await app.evaluate(`document.querySelector('#ownstudio\\.procedure .ownstudio-workbench-body')?.scrollIntoView({ block: 'start' }); true`);
            await sleep(300);
        },
        differences: [
            'uPlot opens at −5 to +40 ms around the step; Whole run restores the complete −20 to +82 ms firmware-scope window.',
            'Drag zooms, Shift+wheel pans, the legend is the cursor readout, and each channel button turns its trace on or off.',
            'Simulate at these conditions deliberately leaves this measured-only result first; Open in PulsimGui and Report are beside it.',
        ],
    },
    {
        id: 'overlay', num: '12', title: 'Simulation over the measurement, at the same conditions',
        go: async () => {
            await show('left', 'ownstudio.left.lab');
            for (let n = 0; n < 40 && !await app.evaluate(`document.querySelector('[data-run-target="board"]')?.dataset.ready === 'true'`); n++) await sleep(400);
            await app.evaluate(`document.querySelector('[data-run-target="board"]')?.scrollIntoView({ block: 'center' }); true`);
            await sleep(300);
            if (!await app.clickOn('[data-run-target="board"]')) { throw new Error('board capture button not found'); }
            await sleep(500);
            const confirmed = await app.evaluate(`(() => { const button = [...document.querySelectorAll('button')]
                .find(e => e.textContent.trim() === 'Switch on and run'); button?.click(); return !!button; })()`);
            if (!confirmed) { throw new Error('power confirmation did not open'); }
            for (let n = 0; n < 80 && !await app.evaluate(`!!document.querySelector('[data-simulate-record]')`); n++) await sleep(400);
            await app.evaluate(`document.querySelector('[data-simulate-record]')?.scrollIntoView({ block: 'center' }); true`);
            await sleep(300);
            if (!await app.clickOn('[data-simulate-record]')) { throw new Error('Simulate at these conditions did not appear'); }
            for (let n = 0; n < 200 && !await app.evaluate(`!!document.querySelector('.os-trace-sim')`); n++) await sleep(500);
            if (!await app.evaluate(`!!document.querySelector('.os-trace-sim')`)) { throw new Error('simulation overlay did not appear'); }
            const state = await app.evaluate(STATE);
            if (state.bottom) { await key('j', 2, 'KeyJ'); await sleep(500); }
            await app.evaluate(`document.querySelector('#ownstudio\\.procedure .ownstudio-workbench-body')?.scrollIntoView({ block: 'start' }); true`);
            await sleep(300);
        },
        differences: [
            'The native switching model runs the same capture procedure only after Simulate at these conditions is pressed; the board result is visible first.',
            'The solid amber measurement and dashed blue simulation share a trigger-aligned time axis; the table compares every captured metric.',
            'The Simulate-tint fidelity chips shown in the storyboard arrive with the simulation sheet in slice 2; timeline dots arrive in U18.',
        ],
    },
    {
        id: 'example', num: '5', title: 'Load an example: it lands on its own branch',
        go: async () => {
            await app.clickOn('#theia-top-panel .lm-MenuBar-item:nth-child(1)');
            await sleep(400);
            const key = async (k, vk) => { for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: vk }); } await sleep(150); };
            for (let i = 0; i < 4; i++) { await key('ArrowDown', 40); }
            await key('ArrowRight', 39);
            await key('Enter', 13);
            await sleep(2500);
        },
        after: async () => {
            for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
        },
        differences: [
            'File › Examples › "Examples of the board…" opens a picker of the board\'s examples, grouped as the frame\'s submenu; the frame draws the list as a submenu.',
            'The timeline\'s branch point and the inspector\'s Example field come with the timeline (U18) and the inspector (U9); the branch shows in the status bar.',
        ],
    },
    {
        id: 'menus', num: '15', title: 'The eight menus',
        go: async () => {
            await app.clickOn('#theia-top-panel .lm-MenuBar-item:nth-child(1)');
            await sleep(500);
        },
        after: async () => {
            for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
        },
        differences: [
            'The frame draws all eight menus side by side as a map; the app opens one at a time (File here). menus-test.mjs checks every menu against the map.',
            'Items not built yet carry "(slice N)", including those of slice 1; each drops it when its plan step lands.',
            'File › Open recent opens Theia\'s recent-folders picker rather than a submenu.',
        ],
    },
];

const report = [];
// A run opens either a setup or no folder (the Start page): each frame says which it needs.
const noFolder = await app.evaluate(`document.body.dataset.ownstudioWorkbench === 'start'`);
for (const f of FRAMES.filter(x => (!only || x.id === only) && !!x.noFolder === noFolder)) {
    await f.go();
    // Notifications (such as clangd's download offer) are transient: they are not part of the frame.
    await app.evaluate(`document.querySelectorAll('.theia-notification-toasts .theia-notification-list-item .codicon-close').forEach(b => b.click()); true`);
    await sleep(1200);
    const file = `frame-${f.num.padStart(2, '0')}-${f.id}.png`;
    writeFileSync(join(out, file), await app.screenshot());
    report.push({ frame: f.num, title: f.title, file, state: await app.evaluate(STATE), differences: f.differences });
    await f.after?.();
}
// shots.json gathers every frame: runs with and without a folder each update their own.
let all = [];
try { all = JSON.parse(readFileSync(join(out, 'shots.json'), 'utf8')); } catch { /* first run */ }
const merged = [...all.filter(r => !report.some(n => n.frame === r.frame)), ...report].sort((a, b) => parseFloat(a.frame) - parseFloat(b.frame));
writeFileSync(join(out, 'shots.json'), JSON.stringify(merged, null, 1) + '\n');
console.log(JSON.stringify(report.map(r => ({ frame: r.frame, file: r.file })), null, 1));
app.close();
