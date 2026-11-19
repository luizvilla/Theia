// SPDX-License-Identifier: LGPL-2.1-only
// F9 gate (Q181): the Code workbench shows the setup's files in two groups, "Your code" (main.cpp
// and control.cpp first) and "App" (scope included), and nothing else; AGENTS.md, LICENSE,
// platformio.ini and the like appear only with "Show all files", and "Show grouped files" comes
// back. A file added in src/ shows in Your code. No file moves on disk.
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/grouped-files-test.mjs <setup>
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(4000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const visible = sel => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.getClientRects().length)`;
const group = id => app.evaluate(`${visible(`[data-file-group="${id}"] [data-file]`)}.map(e => e.dataset.file)`);
const treeNames = () => app.evaluate(`${visible('#files .theia-TreeNode')}.map(e => e.textContent.trim())`);
const save = async name => { if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/${name}.png`, await app.screenshot()); } };
const before = execFileSync('git', ['-C', setup, 'ls-files'], { encoding: 'utf8' });

const code = await group('code');
const appFiles = await group('app');
check(JSON.stringify(code.slice(0, 2)) === '["src/main.cpp","src/control.cpp"]' && code.includes('src/control.h'),
    `Your code starts with main.cpp and control.cpp (${code.join(', ')})`);
check(['src/app.conf', 'src/app.ini', 'src/scope.cpp', 'src/data_objects.cpp', 'ownstudio/design/control_loop.py'].every(f => appFiles.includes(f)) && !appFiles.some(f => code.includes(f)),
    `App holds the template's files, scope included (${appFiles.length}: ${appFiles.slice(0, 6).join(', ')}…)`);
const tree = await treeNames();
const hiddenShown = ['AGENTS.md', 'CLAUDE.md', 'LICENSE', 'platformio.ini', 'west.yml'].filter(n => tree.includes(n) || [...code, ...appFiles].some(f => f.endsWith(n)));
check(hiddenShown.length === 0, `agents, licence, PlatformIO and west files are not shown (${hiddenShown.join(', ') || 'none'})`);
await save('files-grouped');

// The pointer moves onto the file first, as a hand does (Theia acts on clicks after a move).
const at = await app.evaluate(`(() => { const r = document.querySelector('[data-file="src/control.cpp"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
await sleep(200);
await app.click(at.x, at.y);
let title = '';
for (let i = 0; i < 30 && title !== 'control.cpp'; i++) {          // the first editor of a session takes a moment
    await sleep(250);
    title = await app.evaluate(`document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel')?.textContent ?? ''`);
}
check(title === 'control.cpp', `a click opens it ("${title}")`);

fs.writeFileSync(path.join(setup, 'src/filters.cpp'), '// a file of my own\n');
await sleep(2500);
check((await group('code')).includes('src/filters.cpp'), 'a file added in src/ shows in Your code');
fs.rmSync(path.join(setup, 'src/filters.cpp'));

await app.clickOn('[data-show-all]');
await sleep(1500);
const all = await treeNames();
check(['AGENTS.md', 'LICENSE', 'platformio.ini', 'src'].every(n => all.includes(n)) && !(await group('code')).length,
    `Show all files puts Theia's file tree in its place (${all.slice(0, 8).join(', ')}…)`);
await save('files-all');
const back = await app.evaluate(`(() => { const e = document.querySelector('[id="ownstudio.files.showGrouped"]'); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
// The part's toolbar shows when the pointer is over it, as in Theia.
const head = await app.evaluate(`(() => { const r = document.querySelector('#files')?.getBoundingClientRect(); return r && { x: r.x + 40, y: r.y + 30 }; })()`);
if (head) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: head.x, y: head.y }); await sleep(300); }
check(await app.clickOn('[id="ownstudio.files.showGrouped"]'), `its toolbar offers Show grouped files${back ? '' : ' (not found before hover)'}`);
await sleep(1500);
check((await group('code')).length === code.length && !(await treeNames()).length, 'and the groups come back');
check(execFileSync('git', ['-C', setup, 'ls-files'], { encoding: 'utf8' }) === before, 'no file moved on disk');

app.close();
process.exit(failures ? 1 : 0);
