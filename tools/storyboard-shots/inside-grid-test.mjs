// SPDX-License-Identifier: LGPL-2.1-only
// F10 gate (Q182): the inside of the Twist on a fixed grid. At several window sizes, every arrow
// (signals and feeder lines) starts and ends on its blocks' edges in screen pixels, and the
// blocks keep their proportions. Screenshots for each size go to SHOT_DIR.
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/inside-grid-test.mjs
import * as fs from 'node:fs';
import { connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(4000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

await app.doubleClickOn('.react-flow__node[data-id="board"]');
await sleep(800);
check(await app.evaluate(`!!document.querySelector('.ownstudio-inside-view')`), 'double-clicking the Twist opens its inside');

// For each arrow: how far (px) its first and last points are from the nearest edge of the blocks it joins.
const measure = `(() => {
    const svg = document.querySelector('.ownstudio-inside-view'); const m = svg.getScreenCTM();
    const box = id => { const r = svg.querySelector('[data-block="' + id + '"] rect').getBoundingClientRect(); return r; };
    const toScreen = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const s = p.matrixTransform(m); return [s.x, s.y]; };
    const edge = ([x, y], r) => { const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
        const outside = Math.hypot(dx, dy); if (outside > 0) return outside;
        return Math.min(x - r.left, r.right - x, y - r.top, r.bottom - y); };
    const ends = path => { const d = path.getAttribute('d').match(/-?[\\d.]+/g).map(Number); return [toScreen(d[0], d[1]), toScreen(d.at(-2), d.at(-1))]; };
    const out = [];
    for (const p of svg.querySelectorAll('[data-signal]')) { const [a, b] = p.dataset.signal.split('-'); const [s, e] = ends(p); out.push([p.dataset.signal, edge(s, box(a)), edge(e, box(b))]); }
    for (const p of svg.querySelectorAll('[data-energy]')) { const [s, e] = ends(p); out.push(['feeder-' + p.dataset.energy, edge(s, box('feeder')), edge(e, box(p.dataset.energy))]); }
    const power = box('power');
    return { arrows: out, ratio: power.width / power.height };
})()`;

for (const [width, height] of [[1280, 800], [1600, 700], [1000, 900]]) {
    await app.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(1200);
    const { arrows, ratio } = await app.evaluate(measure);
    const worst = Math.max(...arrows.flatMap(a => [a[1], a[2]]));
    check(arrows.length === 8 && worst <= 1.5, `${width}×${height}: the ${arrows.length} arrows meet their blocks (worst ${worst.toFixed(2)} px)`);
    check(Math.abs(ratio - 220 / 44) < 0.05, `${width}×${height}: blocks keep their shape (${ratio.toFixed(2)}, grid 5.00)`);
    if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/inside-${width}x${height}.png`, await app.screenshot()); }
}
await app.send('Emulation.clearDeviceMetricsOverride');

check(await app.clickOn('.ownstudio-inside-block[data-block="driver"]'), 'Driver can be clicked');
await sleep(500);
const inspector = await app.evaluate(`document.querySelector('#ownstudio\\\\.inspector')?.textContent ?? ''`);
check(/200 kHz/.test(inspector) && /Driver/.test(inspector), `its details open in the Inspector ("${inspector.slice(0, 90)}")`);

app.close();
process.exit(failures ? 1 : 0);
