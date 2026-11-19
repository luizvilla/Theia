// SPDX-License-Identifier: LGPL-2.1-only
// F15 gate: on Design › Output filter, the dot of "Output ripple vs L" stays on the yellow curve
// while L is dragged, also in the instant before the sheet's next calculation comes back, and
// after it (it used to slide sideways at the old height). Checked in screen pixels.
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/ripple-dot-test.mjs
import { connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(3000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

await app.clickOn('[id="shell-tab-ownstudio.left.design"]');
for (let i = 0; i < 60 && !await app.evaluate(`!!document.querySelector('.ownstudio-ripple-curve circle')`); i++) {
    await sleep(250);
}
// How far, in SVG units, the dot is from the polyline at its x.
const offCurve = `(() => {
    const svg = document.querySelector('.ownstudio-ripple-curve'); if (!svg) return null;
    const dot = svg.querySelector('circle'); const line = svg.querySelector('polyline');
    const pts = line.getAttribute('points').trim().split(/\\s+/).map(p => p.split(',').map(Number));
    const cx = Number(dot.getAttribute('cx')), cy = Number(dot.getAttribute('cy'));
    for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (cx >= x0 - 0.01 && cx <= x1 + 0.01) { const y = x1 === x0 ? y0 : y0 + (cx - x0) / (x1 - x0) * (y1 - y0); return Math.abs(y - cy); }
    }
    return Infinity; })()`;
const box = await app.evaluate(`(() => { const r = document.querySelector('[data-field="L"] input[type=range]')?.getBoundingClientRect();
    return r && { x: r.x, y: r.y + r.height / 2, w: r.width }; })()`);
check(!!box, 'the L slider is there');
if (box) {
    const at = h => box.x + box.w * Math.log(h / 10e-6) / Math.log(15);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at(33e-6), y: box.y });
    await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at(33e-6), y: box.y, button: 'left', clickCount: 1 });
    const right = [];
    let worst = 0;
    for (const h of [40e-6, 55e-6, 70e-6, 90e-6, 120e-6, 25e-6, 15e-6, 11e-6]) {
        await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at(h), y: box.y, button: 'left', buttons: 1 });
        await sleep(20);            // before the sheet's next calculation
        const instant = await app.evaluate(offCurve);
        await sleep(700);           // after it
        const settled = await app.evaluate(offCurve);
        worst = Math.max(worst, instant ?? Infinity, settled ?? Infinity);
        right.push(`${(h * 1e6).toFixed(0)} µH: ${instant?.toFixed(2)} / ${settled?.toFixed(2)}`);
    }
    await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at(11e-6), y: box.y, button: 'left', clickCount: 1 });
    check(worst <= 1.5, `the dot stays on the curve while L is dragged (worst ${worst.toFixed(2)} px; at each L, just moved / settled: ${right.join(', ')})`);
}

app.close();
process.exit(failures ? 1 : 0);
