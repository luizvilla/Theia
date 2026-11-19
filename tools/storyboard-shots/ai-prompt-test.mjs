// SPDX-License-Identifier: LGPL-2.1-only
// F15 gate: spaces typed in the AI prompt stay (React Flow's Space pan key used to eat them).
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/ai-prompt-test.mjs
import { connect, sleep, waitForWindow } from './cdp.mjs';
const [port] = process.argv.slice(2);
const app = await connect(port); await waitForWindow(app); await sleep(4000);
await app.send('Page.bringToFront');
const tabs = await app.evaluate(`[...document.querySelectorAll('.lm-TabBar.theia-app-right .lm-TabBar-tab')].map(t => t.id)`);
const ai = tabs.find(id => /ai|chat/i.test(id));
await app.clickOn(`[id="${ai}"]`); await sleep(2500);
const box = await app.evaluate(`(() => { const e = document.querySelector('.theia-ChatInput .monaco-editor .view-lines, .chat-input-widget .monaco-editor .view-lines, [class*=ChatInput] .monaco-editor'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
if (box) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await app.click(box.x, box.y); await sleep(500); }
for (const ch of 'hello world') {
    const code = ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`;
    await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0) });
    await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0) });
    await sleep(60);
}
await sleep(800);
const typed = await app.evaluate(`[...document.querySelectorAll('[class*=ChatInput] .monaco-editor .view-line, .chat-input-widget .view-line')].map(l => l.textContent).join('\\n')`);
const ok = !!box && typed.replace(/\u00a0/g, ' ') === 'hello world';
console.log(`${ok ? 'ok  ' : 'FAIL'} the AI prompt keeps its spaces ("${typed}")`);
app.close(); process.exit(ok ? 0 : 1);
