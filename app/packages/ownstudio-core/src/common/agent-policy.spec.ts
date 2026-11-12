// SPDX-License-Identifier: LGPL-2.1-only
// Plan U17: neither agent can be put in a mode that skips approval or sandbox.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { CODEX_MODES, claudePermissionMode, codexSandboxMode } from './agent-policy.js';

test('Claude Code keeps asking: bypassPermissions and unknown modes become default', () => {
    assert.equal(claudePermissionMode('bypassPermissions'), 'default');
    assert.equal(claudePermissionMode(undefined), 'default');
    assert.equal(claudePermissionMode('anything'), 'default');
    assert.equal(claudePermissionMode('acceptEdits'), 'acceptEdits');
    assert.equal(claudePermissionMode('plan'), 'plan');
});

test('Codex stays in a sandbox: full access is never offered nor used', () => {
    assert.deepEqual(CODEX_MODES.map(m => m.id), ['workspace-write', 'read-only']);
    assert.equal(codexSandboxMode('danger-full-access'), 'workspace-write');
    assert.equal(codexSandboxMode(undefined), 'workspace-write');
    assert.equal(codexSandboxMode('read-only'), 'read-only');
});
