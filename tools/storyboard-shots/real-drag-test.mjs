// SPDX-License-Identifier: LGPL-2.1-only
// F1 gate (Q176): a part placed three ways, each as a user does it: dragged from Parts
// through Chromium's own drag pipeline (CDP Input.* events, as a mouse or touchpad, not
// hand-built DragEvents), clicked in Parts, and chosen from Setup › Add part.
// Run it on a setup whose canvas holds the Twist alone:
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/real-drag-test.mjs
import { connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(3000);

const tabs = { right: 'ownstudio.parts', bottom: 'ownstudio.canvas' };
for (const [side, id] of Object.entries(tabs)) {
    const sel = side === 'bottom' ? `#theia-bottom-content-panel [id="shell-tab-${id}"]`
        : `.lm-TabBar.theia-app-${side} .lm-TabBar-content [id="shell-tab-${id}"]`;
    const content = id === 'ownstudio.parts' ? '#ownstudio\\.parts [data-part]' : '#ownstudio\\.canvas .ownstudio-canvas';
    if (!await app.evaluate(`!!document.querySelector(${JSON.stringify(content)})?.getClientRects().length`)) {
        await app.clickOn(sel);
        await sleep(800);
    }
}

const centre = sel => app.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })()`);
const nodes = async () => Number(await app.evaluate(`document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas')?.dataset.nodeCount ?? -1`));
const refusal = () => app.evaluate(`document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas-refusal')?.textContent ?? ''`);
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

// 1. Drag: the source to the left of the canvas, a resistor to the right.
for (const part of ['dc-source', 'resistor']) {
    const src = await centre(`#ownstudio\\.parts [data-part="${part}"]`);
    const canvas = await centre('#ownstudio\\.canvas .ownstudio-canvas');
    if (!src || !canvas) { check(false, `drag ${part}: Parts or canvas not visible`); continue; }
    const target = { x: canvas.x + (part === 'dc-source' ? -0.3 : 0.3) * canvas.w, y: canvas.y };
    const before = await nodes();
    await app.send('Input.setInterceptDrags', { enabled: true });
    const intercepted = new Promise(r => app.on('Input.dragIntercepted', p => r(p.data)));
    await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: src.x, y: src.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
        await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
            x: src.x + (target.x - src.x) * i / 10, y: src.y + (target.y - src.y) * i / 10 });
    }
    const data = await Promise.race([intercepted, sleep(3000).then(() => null)]);
    if (data) {
        for (const type of ['dragEnter', 'dragOver', 'drop']) {
            await app.send('Input.dispatchDragEvent', { type, x: target.x, y: target.y, data });
        }
    }
    await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left' });
    await app.send('Input.setInterceptDrags', { enabled: false });
    await sleep(800);
    const after = await nodes();
    check(data && after === before + 1, `drag ${part}: nodes ${before} -> ${after}${data ? '' : ' (no drag started)'}`);
}

// 2. Click: a second resistor, placed beside the Twist.
{
    const before = await nodes();
    await app.clickOn('#ownstudio\\.parts [data-part="resistor"]');
    await sleep(800);
    const after = await nodes();
    check(after === before + 1, `click resistor: nodes ${before} -> ${after}`);
}

// 3. Menu: Setup › Add part › DC source. A second source is refused with its sentence.
{
    const before = await nodes();
    await app.send('Page.bringToFront');
    const index = await app.evaluate(`[...document.querySelectorAll('#theia-top-panel .lm-MenuBar-item')].findIndex(e => e.textContent.trim() === 'Setup') + 1`);
    await app.clickOn(`#theia-top-panel .lm-MenuBar-item:nth-child(${index})`);
    await sleep(400);
    let reached = true;
    for (const label of ['Add part', 'DC source']) {
        const at = await app.evaluate(`(() => { const e = [...document.querySelectorAll('.lm-Menu .lm-Menu-item')].reverse()
            .find(e => e.querySelector('.lm-Menu-itemLabel')?.textContent === ${JSON.stringify(label)});
            if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!at) { reached = label; break; }
        // Lumino picks the active item on mouse movement, as a hand moving over the menu.
        await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await sleep(300);
        await app.click(at.x, at.y);
        await sleep(500);
    }
    const after = await nodes();
    const sentence = await refusal();
    check(reached === true && after === before && /source/i.test(sentence), `menu second DC source refused (missing menu item: ${reached === true ? 'none' : reached}): nodes ${before} -> ${after}, "${sentence}"`);
}

app.close();
process.exit(failures ? 1 : 0);
