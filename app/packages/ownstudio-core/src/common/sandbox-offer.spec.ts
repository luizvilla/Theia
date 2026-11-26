// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { SandboxStatus, sandboxOffer } from './sandbox-offer.js';

const debian: SandboxStatus = { supported: true, missing: ['socat'], packageManager: 'apt', canInstall: true };

test('#51: on Debian or Ubuntu, a missing tool comes with an Install button and Codex meanwhile', () => {
    const offer = sandboxOffer(debian);
    assert.match(offer.text, /Claude Code runs only in its sandbox/);
    assert.match(offer.text, /socat/);
    assert.doesNotMatch(offer.text, /bubblewrap/);
    assert.match(offer.text, /@Codex/);
    assert.deepEqual(offer.options.map(o => o.text), ['Install socat', 'Not now']);
    assert.equal(offer.options[0].value, 'install');
});

test('#51: without the password dialog, the command goes to whoever runs the machine', () => {
    const offer = sandboxOffer({ ...debian, missing: ['bubblewrap', 'socat'], canInstall: false });
    assert.match(offer.text, /sudo apt-get install -y bubblewrap socat/);
    assert.match(offer.text, /whoever runs this computer/);
    assert.deepEqual(offer.options, []);
});

test('#51: on Fedora the command is dnf, elsewhere the packages are named', () => {
    assert.match(sandboxOffer({ ...debian, packageManager: 'dnf', canInstall: false }).text, /sudo dnf install -y socat/);
    const other = sandboxOffer({ ...debian, packageManager: undefined, canInstall: false }).text;
    assert.match(other, /package manager/);
    assert.match(other, /socat/);
});

test('#51: a cancelled install says so and shows the command', () => {
    const offer = sandboxOffer(debian, 'cancelled');
    assert.match(offer.text, /install did not finish/);
    assert.match(offer.text, /sudo apt-get install -y socat/);
    assert.deepEqual(offer.options, []);
});

test('#51: where the sandbox cannot run at all, only Codex is offered', () => {
    const offer = sandboxOffer({ supported: false, missing: [], canInstall: false });
    assert.match(offer.text, /cannot run on this computer/);
    assert.match(offer.text, /@Codex/);
    assert.deepEqual(offer.options, []);
});
