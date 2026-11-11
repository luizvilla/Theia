// SPDX-License-Identifier: LGPL-2.1-only
// Plan U3: the menu bar of the running app shows exactly the menu map
// (app/packages/ownstudio-core/src/common/menu-map.ts), menu by menu, item by item.
//
// Usage: run.sh <port> <folder> menus-test.mjs
import { createRequire } from 'node:module';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const require = createRequire(import.meta.url);
const { MENU_MAP, shownLabel } = require('../../app/packages/ownstudio-core/lib/common/menu-map.js');
const [port] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');

const expectedItems = items => {
    const out = [];
    for (const i of items) {
        if (i === '-') { out.push('—'); continue; }
        if (i.when) { continue; }          // hidden until its context key holds
        out.push(i.items ? `${i.label} ▸` : shownLabel(i));
    }
    return out;
};

const bar = await app.evaluate(`[...document.querySelectorAll('#theia-top-panel .lm-MenuBar-item .lm-MenuBar-itemLabel')].map(e => e.textContent)`);
const problems = [];
if (JSON.stringify(bar) !== JSON.stringify(MENU_MAP.map(m => m.label))) {
    problems.push({ menubar: bar, expected: MENU_MAP.map(m => m.label) });
}
for (const [i, menu] of MENU_MAP.entries()) {
    await app.clickOn(`#theia-top-panel .lm-MenuBar-item:nth-child(${i + 1})`);
    await sleep(400);
    const shown = await app.evaluate(`[...document.querySelectorAll('.lm-Menu:last-of-type .lm-Menu-item')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => e.dataset.type === 'separator' ? '—' : e.querySelector('.lm-Menu-itemLabel').textContent + (e.dataset.type === 'submenu' ? ' ▸' : ''))`);
    const want = expectedItems(menu.items);
    if (JSON.stringify(shown) !== JSON.stringify(want)) { problems.push({ menu: menu.label, shown, expected: want }); }
    await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(300);
}
console.log(JSON.stringify({ menubar: bar, problems }, null, 1));
app.close();
process.exit(problems.length ? 1 : 0);
