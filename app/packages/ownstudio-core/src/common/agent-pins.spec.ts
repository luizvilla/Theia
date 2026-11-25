// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AGENT_IDS, AGENT_PINS, agentEntry, agentFolder, agentPackages } from './agent-pins.js';

const linux = { platform: 'linux', arch: 'x64', musl: false };

test('#47: Claude Code on Linux is the SDK and its glibc native package', () => {
    assert.deepEqual(agentPackages('claude', linux)?.map(p => p.folder),
        ['@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-agent-sdk-linux-x64']);
    assert.deepEqual(agentPackages('claude', { ...linux, musl: true })?.map(p => p.folder),
        ['@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-agent-sdk-linux-x64-musl']);
});

test('#47: Codex is its native package only (Theia\'s SDK drives the binary)', () => {
    assert.deepEqual(agentPackages('codex', { platform: 'darwin', arch: 'arm64', musl: false })?.map(p => p.folder),
        ['@openai/codex-darwin-arm64']);
    // Codex's Linux binaries are static musl ones: one package for both C libraries.
    assert.deepEqual(agentPackages('codex', { ...linux, musl: true })?.map(p => p.folder), ['@openai/codex-linux-x64']);
});

test('#47: an unsupported platform has nothing to install', () => {
    assert.equal(agentPackages('codex', { platform: 'freebsd', arch: 'x64', musl: false }), undefined);
    assert.equal(agentPackages('claude', { platform: 'linux', arch: 'ia32', musl: false }), undefined);
});

test('#47: the entry point inside the install folder', () => {
    assert.equal(agentEntry('claude', linux), 'node_modules/@anthropic-ai/claude-agent-sdk');
    assert.equal(agentEntry('codex', linux), 'node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
    assert.equal(agentEntry('codex', { platform: 'win32', arch: 'arm64', musl: false }),
        'node_modules/@openai/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe');
});

test('#47: each version installs into its own folder, so moving a pin installs afresh', () => {
    assert.equal(agentFolder('claude'), `claude-${AGENT_PINS.claude.version}`);
    assert.equal(agentFolder('codex'), `codex-${AGENT_PINS.codex.version}`);
});

test('#47: every pin is an npm tarball with a sha512, under the vendor\'s terms', () => {
    for (const id of AGENT_IDS) {
        const pin = AGENT_PINS[id];
        assert.match(pin.termsUrl, /^https:\/\//);
        for (const p of [...pin.common, ...Object.values(pin.native)]) {
            assert.match(p.tarball, /^https:\/\/registry\.npmjs\.org\/.+\.tgz$/, p.folder);
            assert.match(p.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/, p.folder);
            assert.ok(p.tarball.includes(pin.version), `${p.folder} is not at ${pin.version}`);
        }
    }
});
