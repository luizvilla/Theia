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
            'Canvas, inspector and timeline are empty: no setup exists until U5 to U9, and the timeline\'s dots come in U18.',
            'The Code panel is Theia\'s explorer (open editors, the folder, the git timeline); "My files" and the libraries list come with setups.',
            'The status bar shows Build, Upload and Serial as icons; board and firmware entries come with the board definition (U4) and the build (U10).',
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
            'The file mapping under the nodes and the Build/Upload toolbar come with U10.',
            'The timeline dots come in U18.',
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
