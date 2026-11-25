// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentInstallStatus } from './agent-install-protocol.js';
import { installOffer, installProgressText } from './agent-install-offer.js';

const claude: AgentInstallStatus = {
    id: 'claude', label: 'Claude Code', version: '0.3.332', vendor: 'Anthropic',
    termsUrl: 'https://code.claude.com/docs/en/legal-and-compliance', downloadMB: 190, installed: false, supported: true,
};

test('#47: the offer names the version, the download, the folder and the vendor\'s terms', () => {
    const offer = installOffer(claude);
    assert.match(offer.text, /Claude Code is not installed/);
    assert.match(offer.text, /0\.3\.332/);
    assert.match(offer.text, /190 MB/);
    assert.match(offer.text, /OwnStudio's own folder/);
    assert.match(offer.text, /no terminal/);
    assert.match(offer.text, /\[Anthropic's terms\]\(https:\/\/code\.claude\.com\/docs\/en\/legal-and-compliance\)/);
    assert.deepEqual(offer.options.map(o => o.text), ['Install Claude Code', 'Not now']);
    assert.equal(offer.options[0].value, 'install');
});

test('#47: an agent with no build for this computer is not offered', () => {
    const offer = installOffer({ ...claude, supported: false });
    assert.match(offer.text, /no build for this computer/);
    assert.deepEqual(offer.options, []);
});

test('#47: progress in MB, with the package count when there are several', () => {
    assert.equal(installProgressText({ id: 'codex', index: 0, count: 1, received: 50 * 1048576, total: 175 * 1048576 }), '50 of 175 MB');
    assert.equal(installProgressText({ id: 'claude', index: 1, count: 2, received: 1048576 }), 'part 2 of 2: 1 MB');
});
