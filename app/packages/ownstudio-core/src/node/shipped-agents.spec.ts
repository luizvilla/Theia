// SPDX-License-Identifier: LGPL-2.1-only
// #47 (ADR 0031 amendment): OwnStudio ships no agent. What the installer bundles is the
// app's node_modules, so neither the Claude agent SDK nor a Codex binary may be in it.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../../../..');
const manifest = (dir: string) => JSON.parse(fs.readFileSync(path.join(APP, dir, 'package.json'), 'utf8'));

test('#47: no package of OwnStudio depends on an agent', () => {
    for (const dir of ['.', 'applications/electron', 'packages/ownstudio-core']) {
        const deps = Object.keys({ ...manifest(dir).dependencies, ...manifest(dir).optionalDependencies });
        assert.deepEqual(deps.filter(d => /claude-agent-sdk|^@openai\/codex$/.test(d)), [], dir);
    }
});

test('#47: the app\'s node_modules carries neither the Claude agent SDK nor a Codex binary', () => {
    const modules = path.join(APP, 'node_modules');
    const anthropic = path.join(modules, '@anthropic-ai');
    const sdks = fs.existsSync(anthropic) ? fs.readdirSync(anthropic).filter(d => d.startsWith('claude-agent-sdk')) : [];
    assert.deepEqual(sdks, [], 'run npm install in app/');
    // Theia's @openai/codex-sdk is kept for its JavaScript; its vendor/ (the 0.49 binaries) is dropped on install.
    assert.ok(fs.existsSync(path.join(modules, '@openai', 'codex-sdk', 'dist', 'index.js')));
    assert.ok(!fs.existsSync(path.join(modules, '@openai', 'codex-sdk', 'vendor')), 'run npm install in app/ (postinstall drops it)');
    assert.ok(!fs.existsSync(path.join(modules, '@openai', 'codex')));
});
