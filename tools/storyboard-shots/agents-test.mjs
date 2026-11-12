// SPDX-License-Identifier: LGPL-2.1-only
// U17 gate: the AI tab offers the user's own Claude Code and Codex agents, the
// old key-based OwnStudio agent is gone, Codex offers no "Full Access" mode,
// and the setup's AGENTS.md is there for them to read.
// Usage: run.sh <port> <setup> agents-test.mjs <setup>
import fs from 'node:fs';
import path from 'node:path';
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port, setupArg] = process.argv.slice(2);
const setup = setupArg || process.env.OWNSTUDIO_STORYBOARD_SETUP;
const app = await connect(port);
const exceptions = [];
await app.send('Runtime.enable');
app.on('Runtime.exceptionThrown', e => exceptions.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
await waitForWindow(app);
await sleep(3000);
const failures = [];

await app.clickOn('[id="shell-tab-chat-view-widget"]');
await sleep(1500);
// Type "@" in the chat input: Theia suggests the agents it knows.
await app.clickOn('#chat-view-widget .monaco-editor .view-lines');
await sleep(300);
await app.send('Input.insertText', { text: '@' });
const rows = `[...document.querySelectorAll('.suggest-widget .monaco-list-row, .quick-input-list .monaco-list-row')].map(r => r.getAttribute('aria-label') || r.textContent.trim())`;
let agents = [];
for (let n = 0; n < 30 && agents.length < 2; n++) {
    await sleep(300);
    agents = await app.evaluate(rows);
    if (n === 10 && !agents.length) {
        // The suggestion did not open from typing: the input's "@" button lists the same agents.
        await app.evaluate(`[...document.querySelectorAll('#chat-view-widget .codicon-mention')].pop()?.click(); true`);
    }
}
const names = agents.join(' | ');
if (!/Claude ?Code/i.test(names)) failures.push(`Claude Code is not offered (agents: ${names})`);
if (!/Codex/i.test(names)) failures.push(`Codex is not offered (agents: ${names})`);
if (/OwnStudio/i.test(names)) failures.push(`the old OwnStudio agent is still offered (agents: ${names})`);
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }

// Address Codex: its sandbox menu must offer Workspace and Read-Only, never Full Access.
await app.clickOn('#chat-view-widget .monaco-editor .view-lines');
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); }
await app.send('Input.insertText', { text: '@Codex ' });
await sleep(1200);
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
await sleep(500);
const box = await app.evaluate(`(() => { const e = [...document.querySelectorAll('#chat-view-widget *')]
    .find(x => x.children.length <= 2 && x.textContent.trim() === 'Workspace' && x.offsetWidth > 0);
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const opened = !!box;
if (box) await app.click(box.x, box.y);
await sleep(600);
const codexModes = await app.evaluate(`(() => {
    const leaf = [...document.querySelectorAll('body *')].find(e => e.children.length === 0 && e.textContent.trim() === 'Read-Only' && e.offsetWidth > 0);
    const list = leaf?.closest('ul, [role="menu"], [role="listbox"], .lm-Menu, .monaco-list, .theia-select-component-dropdown, div[class*="dropdown"]') ?? leaf?.parentElement?.parentElement;
    return list ? [...list.querySelectorAll('*')].filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean) : [];
})()`);
if (!opened) failures.push('Codex mode selector not found');
if (!codexModes.some(m => m.includes('Read-Only'))) failures.push(`Codex modes do not list Read-Only: ${JSON.stringify(codexModes)}`);
if (codexModes.some(m => /Full Access/i.test(m))) failures.push(`Codex still offers Full Access: ${JSON.stringify(codexModes)}`);
for (const type of ['keyDown', 'keyUp']) { await app.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }

const agentsMd = setup && fs.existsSync(path.join(setup, 'AGENTS.md')) ? fs.readFileSync(path.join(setup, 'AGENTS.md'), 'utf8') : '';
if (!/never switch the converter on/i.test(agentsMd)) failures.push('the setup has no AGENTS.md with the power rule');
if (exceptions.length) failures.push(`browser exceptions: ${exceptions.join(' | ')}`);

console.log(JSON.stringify({ agents, codexModes, agentsMd: agentsMd.length, failures }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
