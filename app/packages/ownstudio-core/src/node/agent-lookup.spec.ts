// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodeServiceImpl } from '@theia/ai-claude-code/lib/node/claude-code-service-impl.js';
import { CodexServiceImpl } from '@theia/ai-codex/lib/node/codex-service-impl.js';
import { AgentId } from '../common/agent-pins.js';
import { codexOptions, useInstalledAgents } from './agent-lookup.js';

type ClaudeInternals = { importClaudeCodeSDK(custom?: string): Promise<{ query: unknown }> };

/** A stand-in SDK folder: its query says which one Theia imported. */
function fakeSdk(root: string, name: string): string {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sdk.mjs'), `export const query = '${name}';`);
    fs.writeFileSync(path.join(dir, 'cli.js'), '');
    return dir;
}

test('#47: Claude Code loads the SDK installed in OwnStudio\'s folder, and a settings path still wins', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-lookup-'));
    try {
        const installed = fakeSdk(root, 'installed');
        const custom = fakeSdk(root, 'custom');
        useInstalledAgents(id => id === 'claude' ? installed : undefined);
        const service = Object.create(ClaudeCodeServiceImpl.prototype) as ClaudeInternals;
        assert.equal((await service.importClaudeCodeSDK()).query, 'installed');
        assert.equal((await service.importClaudeCodeSDK(path.join(custom, 'cli.js'))).query, 'custom');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('#47: without an install, Claude Code says to install it from the AI tab (no global npm lookup)', async () => {
    useInstalledAgents(() => undefined);
    const service = Object.create(ClaudeCodeServiceImpl.prototype) as ClaudeInternals;
    await assert.rejects(service.importClaudeCodeSDK(), /Install Claude Code.*AI tab/);
});

test('#47: Codex runs the installed binary', () => {
    const find = (id: AgentId) => id === 'codex' ? '/agents/codex-1/bin/codex' : undefined;
    assert.deepEqual(codexOptions(find), { codexPathOverride: '/agents/codex-1/bin/codex' });
    assert.throws(() => codexOptions(() => undefined), /Install Codex.*AI tab/);
});

test('#47: without an install, a Codex request ends in that error, not in Theia\'s own Codex', async () => {
    useInstalledAgents(() => undefined);
    const errors: string[] = [];
    const service = Object.create(CodexServiceImpl.prototype) as CodexServiceImpl;
    Object.assign(service, {
        client: { sendToken: () => undefined, sendError: (_: string, e: Error) => errors.push(e.message) },
        logger: { info: () => undefined, error: () => undefined },
        abortControllers: new Map(), sessionThreads: new Map(),
    });
    await service.send({ prompt: 'hi', sessionId: 's' }, 'stream');
    await new Promise(r => setTimeout(r, 50));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Install Codex/);
});
