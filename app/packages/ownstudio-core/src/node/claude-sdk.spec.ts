// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bundledClaudeSdk } from './claude-sdk.js';

test('F7: the agent SDK is found beside the app, upwards from the backend', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownstudio-sdk-'));
    try {
        const sdk = path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
        fs.mkdirSync(sdk, { recursive: true });
        const backend = path.join(root, 'applications', 'electron', 'lib', 'backend');
        fs.mkdirSync(backend, { recursive: true });
        assert.equal(bundledClaudeSdk([backend]), undefined, 'no sdk.mjs yet');
        fs.writeFileSync(path.join(sdk, 'sdk.mjs'), 'export {}');
        assert.equal(bundledClaudeSdk([backend]), sdk);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('F7: this checkout carries the SDK that Theia imports (sdk.mjs)', () => {
    const found = bundledClaudeSdk([process.cwd()]);
    assert.ok(found && fs.existsSync(path.join(found, 'sdk.mjs')), `no @anthropic-ai/claude-agent-sdk above ${process.cwd()}`);
});
