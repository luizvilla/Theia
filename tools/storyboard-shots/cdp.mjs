// SPDX-License-Identifier: LGPL-2.1-only
// A small Chrome DevTools Protocol client for driving OwnStudio's window (no dependencies).
export async function connect(port) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    await new Promise(r => ws.onopen = r);
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async expression => {
        const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (m.result?.exceptionDetails) { throw new Error(m.result.exceptionDetails.exception?.description ?? 'evaluate failed'); }
        return m.result?.result?.value;
    };
    const click = async (x, y) => {
        for (const type of ['mousePressed', 'mouseReleased']) {
            await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        }
    };
    /** Clicks the centre of the first element matching a CSS selector; false if there is none. */
    const clickOn = async selector => {
        const box = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
            const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
        if (!box) { return false; }
        await click(box.x, box.y);
        return true;
    };
    const screenshot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
    return { send, evaluate, click, clickOn, screenshot, close: () => ws.close() };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Waits until the window of 2.0 is built: the three icon bars and the timeline are there. */
export async function waitForWindow(app, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ready = await app.evaluate(`!!document.querySelector('#ownstudio\\\\.timeline') && !!document.body.dataset.ownstudioWorkbench`).catch(() => false);
        if (ready) { return; }
        await sleep(500);
    }
    throw new Error('the window did not come up');
}

/** What the window shows now, read from the DOM. */
export const STATE = `(() => {
    const cur = sel => [...document.querySelectorAll(sel)].map(t => t.title || t.getAttribute('title') || t.textContent.trim());
    const tabId = t => (t.id || '').replace(/^shell-tab-/, '');
    const current = side => { const t = document.querySelector('.lm-TabBar.theia-app-' + side + ' .lm-TabBar-content .lm-TabBar-tab.lm-mod-current'); return t ? tabId(t) : null; };
    const bottom = document.querySelector('#theia-bottom-content-panel .lm-TabBar-tab.lm-mod-current');
    const main = document.querySelector('#theia-main-content-panel .lm-TabBar-tab.lm-mod-current');
    const visible = id => { const e = document.getElementById(id); return !!e && e.offsetWidth > 0 && e.offsetHeight > 0; };
    const mainId = main ? tabId(main) : null;
    const lines = mainId && document.getElementById(mainId)?.querySelector('.monaco-editor .lines-content');
    return {
        workbench: document.body.dataset.ownstudioWorkbench,
        left: current('left'), right: current('right'),
        bottom: bottom ? tabId(bottom) : null,
        main: mainId,
        centreScroll: lines ? lines.style.top : null,
        leftTabs: [...document.querySelectorAll('.lm-TabBar.theia-app-left .lm-TabBar-content .lm-TabBar-tab')].map(tabId),
        rightTabs: [...document.querySelectorAll('.lm-TabBar.theia-app-right .lm-TabBar-content .lm-TabBar-tab')].map(tabId),
        bottomTabs: [...document.querySelectorAll('#theia-bottom-content-panel .lm-TabBar-tab')].map(t => t.querySelector('.lm-TabBar-tabLabel')?.textContent),
        canvasTint: document.getElementById('ownstudio.canvas')?.dataset.workbench ?? null,
        timeline: visible('ownstudio.timeline'),
        leftOpen: visible('theia-left-content-panel'), rightOpen: visible('theia-right-content-panel'), bottomOpen: visible('theia-bottom-content-panel'),
        status: cur('#theia-statusBar .element').slice(0, 12),
        titleBar: getComputedStyle(document.querySelector('#theia-top-panel') || document.body).backgroundColor,
    };
})()`;

/** Drops a part from the Parts panel onto the canvas at a fraction of its size (HTML drag and drop, as a user's drag). The node shows on React's next render. */
export async function dropPart(app, part, fx = 0.5, fy = 0.5) {
    return app.evaluate(`(() => {
        const src = document.querySelector('#ownstudio\\\\.parts [data-part="${part}"]');
        const cv = document.querySelector('#ownstudio\\\\.canvas .ownstudio-canvas');
        if (!src || !cv) { return null; }
        const r = cv.getBoundingClientRect();
        const dt = new DataTransfer();
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + r.width * ${fx}, clientY: r.y + r.height * ${fy} };
        cv.dispatchEvent(new DragEvent('dragover', at));
        cv.dispatchEvent(new DragEvent('drop', at));
        src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        return true;
    })()`);
}

/** Drags a wire from one port to another with the mouse; returns the number of wires after. */
export async function wire(app, [nodeA, portA], [nodeB, portB]) {
    const centre = (node, port) => app.evaluate(`(() => {
        const h = document.querySelector('.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${port}"]');
        const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const a = await centre(nodeA, portA);
    const b = await centre(nodeB, portB);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
    await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
        await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 12, y: a.y + (b.y - a.y) * i / 12, button: 'left', buttons: 1 });
    }
    await sleep(100);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    return app.evaluate(`document.querySelectorAll('#ownstudio\\\\.canvas .react-flow__edge').length`);
}
