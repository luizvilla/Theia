// SPDX-License-Identifier: LGPL-2.1-only
// Storyboard shots (plan, "every commit that changes the window is checked against
// the storyboards"): drives OwnStudio into the state of each storyboard frame built
// so far and saves a screenshot beside its frame number in docs/images/step-5/.
// Each commit that builds a frame adds it to FRAMES.
//
// Usage: run.sh <port> <folder> shots.mjs [only-frame-id]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, waitForWindow, STATE, sleep } from './cdp.mjs';

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
            await openFile('control.cpp');
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
for (const f of FRAMES.filter(x => !only || x.id === only)) {
    await f.go();
    // Notifications (such as clangd's download offer) are transient: they are not part of the frame.
    await app.evaluate(`document.querySelectorAll('.theia-notification-toasts .theia-notification-list-item .codicon-close').forEach(b => b.click()); true`);
    await sleep(1200);
    const file = `frame-${f.num.padStart(2, '0')}-${f.id}.png`;
    writeFileSync(join(out, file), await app.screenshot());
    report.push({ frame: f.num, title: f.title, file, state: await app.evaluate(STATE), differences: f.differences });
    await f.after?.();
}
writeFileSync(join(out, 'shots.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report.map(r => ({ frame: r.frame, file: r.file })), null, 1));
app.close();
