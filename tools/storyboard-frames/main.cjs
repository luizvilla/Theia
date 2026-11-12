// SPDX-License-Identifier: LGPL-2.1-only
// Electron entry that renders docs/design/storyboards.html, then saves each frame's
// window drawing as docs/images/step-5/storyboard/frame-NN-<id>.png (for the slice report).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'docs/images/step-5/storyboard');
app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1600, height: 1000, show: true });
    console.log('loading');
    // External fonts may not answer offline: do not wait for the load event, wait for the frames.
    win.loadFile(path.join(root, 'docs/design/storyboards.html')).catch(() => undefined);
    for (let n = 0; n < 100; n++) {
        await new Promise(r => setTimeout(r, 200));
        const ready = await win.webContents.executeJavaScript(`document.querySelectorAll('section.frame').length`).catch(() => 0);
        if (ready > 10) break;
    }
    console.log('loaded');
    await new Promise(r => setTimeout(r, 1500));
    fs.mkdirSync(out, { recursive: true });
    const frames = await win.webContents.executeJavaScript(`[...document.querySelectorAll('section.frame')].map(s => {
        const num = s.querySelector('.cap .num')?.textContent.trim();
        return { id: s.id, num };
    })`);
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    for (const f of frames) {
        const box = await win.webContents.executeJavaScript(`(() => { const s = document.getElementById(${JSON.stringify(f.id)});
            const w = s.querySelector('.win') || s.querySelector('.scroll'); s.scrollIntoView();
            const r = w.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
        const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
        const name = `frame-${String(f.num).padStart(2, '0')}-${f.id}.png`;
        fs.writeFileSync(path.join(out, name), Buffer.from(shot.data, 'base64'));
        console.log(name, Math.round(box.width), 'x', Math.round(box.height));
    }
    app.quit();
});
