// SPDX-License-Identifier: LGPL-2.1-only
// F10 gate (Q182): Build output in colour, as VS Code shows PlatformIO. A build that passes ends
// with PlatformIO's SUCCESS and OwnStudio's "Build … ✓" in green; one with a syntax error in
// control.cpp shows the compiler's error, PlatformIO's FAILED and OwnStudio's "Error:" in red.
// Needs the real PlatformIO (OWNSTUDIO_PIO=~/.platformio/penv/bin/pio) and a few minutes:
//   tools/storyboard-shots/run.sh <port> <setup> tools/storyboard-shots/build-colour-test.mjs <setup>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chooseMenu, connect, sleep, waitForWindow } from './cdp.mjs';

const [port, setup] = process.argv.slice(2);
const app = await connect(port);
await waitForWindow(app);
await sleep(5000);
let failures = 0;
const check = (ok, line) => { if (!ok) { failures++; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

// Monaco draws spaces as non-breaking spaces: patterns use \s. The output view draws only the lines in sight: scroll it to the end and read what is shown,
// each piece of text with its colour class.
const pieces = () => app.evaluate(`(() => {
    const ed = [...document.querySelectorAll('.theia-output .monaco-editor')].find(e => e.offsetWidth);
    if (!ed) return [];
    const sc = ed.querySelector('.monaco-scrollable-element'); if (sc) { sc.scrollTop = 1e9; sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 1e6 })); }
    return [...ed.querySelectorAll('.view-line span span')].map(s => ({ text: s.textContent, cls: s.className }));
})()`);
const coloured = (all, pattern, colour) => all.some(p => pattern.test(p.text) && p.cls.includes(colour));
const waitFor = async (pattern, seconds) => {
    for (let i = 0; i < seconds; i++) {
        const all = await pieces();
        if (all.some(p => pattern.test(p.text))) { await sleep(1500); return pieces(); }
        await sleep(1000);
    }
    return pieces();
};

check(await chooseMenu(app, 'Board', 'Build'), 'Board › Build');
let all = await waitFor(/Build\s[0-9a-f]+\s✓/, 900);
check(coloured(all, /^SUCCESS$/, 'ansi-green-fg'), `PlatformIO's SUCCESS is green (${JSON.stringify(all.filter(p => /SUCCESS/.test(p.text)).slice(-1))})`);
check(coloured(all, /Build\s[0-9a-f]+\s✓/, 'ansi-green-fg'), `OwnStudio's "Build … ✓" is green (${JSON.stringify(all.filter(p => /✓/.test(p.text)).slice(-1))})`);
if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/build-success.png`, await app.screenshot()); }

const control = path.join(setup, 'src/control.cpp');
const original = fs.readFileSync(control, 'utf8');
fs.writeFileSync(control, original + '\nint broken = ;\n');
try {
    // "Build … ✓" is written before the build's timeline dot: Build is greyed out until that is done.
    let again = false;
    for (let i = 0; i < 10 && !again; i++) { await sleep(3000); again = await chooseMenu(app, 'Board', 'Build'); }
    check(again, 'Board › Build, with a syntax error');
    all = await waitFor(/^Error:\s/, 600);
    check(coloured(all, /error/, 'ansi-red-fg') || coloured(all, /error/, 'ansi-bright-red-fg'), `the compiler's error is red (${JSON.stringify(all.filter(p => /error/.test(p.text)).slice(0, 2))})`);
    check(coloured(all, /^FAILED$/, 'ansi-red-fg'), `PlatformIO's FAILED is red (${JSON.stringify(all.filter(p => /FAILED/.test(p.text)).slice(-1))})`);
    check(all.some(p => /^Error:\s/.test(p.text) && /theia-output-error/.test(p.cls)), `OwnStudio's "Error:" line is red (${JSON.stringify(all.filter(p => /^Error/.test(p.text)).slice(-1))})`);
    if (process.env.SHOT_DIR) { fs.writeFileSync(`${process.env.SHOT_DIR}/build-failed.png`, await app.screenshot()); }
} finally {
    fs.writeFileSync(control, original);
}

app.close();
process.exit(failures ? 1 : 0);
