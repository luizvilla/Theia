// SPDX-License-Identifier: LGPL-2.1-only
// #20 (F14 finding 3): the window title names what the window shows. After every
// workbench switch it starts with the visible centre tab's label, or with the
// workbench's name when the centre is empty, and it names the open setup.
// Usage: run.sh <port> <setup> title-test.mjs <setup>
import path from 'node:path';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port, setupArg] = process.argv.slice(2);
const setup = path.basename(setupArg || process.env.OWNSTUDIO_STORYBOARD_SETUP || '');
const app = await connect(port);
await waitForWindow(app);
await sleep(4000);

const TABS = { design: 'ownstudio.left.design', code: 'explorer-view-container', lab: 'ownstudio.left.lab' };
const NAMES = { design: 'Design', code: 'Code', lab: 'Lab' };
const failures = [];
const seen = [];

async function check(step) {
    let s;
    for (let n = 0; n < 20; n++) {
        await sleep(150);
        s = await app.evaluate(`(() => {
            const tab = [...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current')].find(t => t.offsetWidth > 0);
            return { title: document.title, centre: tab?.querySelector('.lm-TabBar-tabLabel')?.textContent.trim() ?? null,
                workbench: document.body.dataset.ownstudioWorkbench ?? null };
        })()`);
        const head = s.centre ?? NAMES[s.workbench];
        if (s.title.startsWith(head) && s.title.includes(setup)) { break; }
    }
    seen.push({ step, ...s });
    const head = s.centre ?? NAMES[s.workbench];
    if (!s.title.startsWith(head)) failures.push(`${step}: title "${s.title}" does not start with "${head}" (centre ${s.centre ?? 'empty'}, workbench ${s.workbench})`);
    if (!s.title.includes(setup)) failures.push(`${step}: title "${s.title}" does not name the setup ${setup}`);
}

async function go(wb) {
    if (!await app.clickOn(`.lm-TabBar.theia-app-left .lm-TabBar-content [id="shell-tab-${TABS[wb]}"]`)) failures.push(`no ${wb} tab`);
    await check(`→ ${wb}`);
}

await check('start');
for (const wb of ['lab', 'code', 'design', 'code', 'lab', 'design', 'lab']) {
    await go(wb);
}
// An editor in Code, then away and back: the title follows the editor, then the other centres.
await go('code');
// Quick Open (Ctrl+P) main.cpp.
const key = async (k, code, vk, modifiers = 0) => { for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers, windowsVirtualKeyCode: vk }); } };
await key('p', 'KeyP', 80, 2);
await sleep(700);
await app.send('Input.insertText', { text: 'main.cpp' });
await sleep(1200);
await key('Enter', 'Enter', 13);
await sleep(1500);
const opened = await app.evaluate(`[...document.querySelectorAll('#theia-main-content-panel .lm-TabBar-tab')].some(t => /main\\.cpp/.test(t.textContent))`);
if (opened) {
    await sleep(1500);
    await check('code + main.cpp');
    await go('lab');
    await go('code');
}
console.log(JSON.stringify({ setup, opened, seen, failures }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
