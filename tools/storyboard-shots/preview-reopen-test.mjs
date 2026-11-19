// SPDX-License-Identifier: LGPL-2.1-only
// F15 gate: the timeline preview draws itself in an empty main area, and opens again after its
// tab was closed, with its title, its close button and its content (both used to come back blank).
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/preview-reopen-test.mjs
import { connect, sleep, waitForWindow } from './cdp.mjs';

const app = await connect(process.argv[2]);
await waitForWindow(app);
await sleep(4000);
await app.send('Page.bringToFront');
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const tab = '#theia-main-content-panel .lm-TabBar-tab[id*="ownstudio.timeline.preview"]';
const state = () => app.evaluate(`(() => { const t = document.querySelector('${tab}');
    const body = document.querySelector('.ownstudio-timeline-preview');
    return { tab: !!t, title: t?.querySelector('.lm-TabBar-tabLabel')?.textContent ?? '',
        closable: !!t?.classList.contains('lm-mod-closable'), content: (body?.innerText ?? '').trim().length,
        diff: !!document.querySelector('[data-preview]') }; })()`);
// The dots in view in the strip now (it may scroll), newest first; the current one is not a preview.
const visibleDots = () => app.evaluate(`(() => { const strip = document.querySelector('.ownstudio-timeline-body')?.getBoundingClientRect();
    return [...document.querySelectorAll('.ownstudio-timeline-dot[data-commit]')].filter(d => { const r = d.getBoundingClientRect();
        return strip && r.width && r.left >= strip.left && r.right <= strip.right; }).map(d => d.dataset.commit).slice(0, -1).reverse(); })()`);
const dots = await visibleDots();
const clickDot = async commit => {
    const at = await app.evaluate(`(() => { const r = document.querySelector('.ownstudio-timeline-dot[data-commit="${commit}"]').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await app.click(at.x, at.y);
    await sleep(2500);
};

check(dots.length >= 3, `the timeline has dots (${dots.length})`);
await clickDot(dots[0]);
let s = await state();
check(s.tab && s.title === 'Timeline preview' && s.closable && s.diff, `a dot opens the preview (${JSON.stringify(s)})`);

for (let round = 1; round <= 2; round++) {
    const close = await app.evaluate(`(() => { const c = document.querySelector('${tab} .lm-TabBar-tabCloseIcon'); if (!c) return null;
        const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (close) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: close.x, y: close.y }); await app.click(close.x, close.y); }
    await sleep(1000);
    check(!(await state()).tab, `round ${round}: its close button closes it`);
    const now = await visibleDots();
    await clickDot(now[round % now.length]);
    s = await state();
    check(s.tab && s.title === 'Timeline preview' && s.closable && s.diff, `round ${round}: another dot opens it again, whole (${JSON.stringify(s)})`);
}

app.close();
process.exit(failures ? 1 : 0);
