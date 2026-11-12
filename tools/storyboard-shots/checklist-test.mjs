// SPDX-License-Identifier: LGPL-2.1-only
// End-to-end gate for U11's continuous checklist. The shot harness supplies a
// deterministic Twist through OWNSTUDIO_STORYBOARD_*; EXPECT_READY says which
// state the Run button must reach.
import { connect, waitForWindow, sleep } from './cdp.mjs';

const [port] = process.argv.slice(2);
const expectedReady = process.env.EXPECT_READY === '1';
const app = await connect(port);
await waitForWindow(app);
await sleep(3000);
await app.clickOn('[id="shell-tab-ownstudio.left.lab"]');
await sleep(3500);

const state = await app.evaluate(`(() => ({
    checks: [...document.querySelectorAll('.ownstudio-lab-check')].map(e => ({
        id: e.dataset.check, ok: e.dataset.ok === 'true', text: e.textContent.trim()
    })),
    run: (() => { const e = document.querySelector('[data-run-target="board"]'); return e && {
        ready: e.dataset.ready === 'true', disabled: e.disabled, text: e.textContent.trim()
    }; })(),
    status: [...document.querySelectorAll('#theia-statusBar .element')].map(e => e.textContent.trim())
}) )()`);

const failures = [];
if (state.checks.length !== 6) failures.push(`expected 6 checks, got ${state.checks.length}`);
if (!state.run) failures.push('board Run button missing');
if (state.run && state.run.ready !== expectedReady) failures.push(`Run ready=${state.run.ready}, expected ${expectedReady}`);
if (state.run && state.run.disabled === expectedReady) failures.push(`Run disabled=${state.run.disabled}, expected ${!expectedReady}`);
const count = state.checks.filter(check => check.ok).length;
if (!state.status.some(text => text.includes(`Lab checklist ${count}/6`))) failures.push('status count differs');
console.log(JSON.stringify({ expectedReady, failures, ...state }, null, 1));
app.close();
process.exit(failures.length ? 1 : 0);
