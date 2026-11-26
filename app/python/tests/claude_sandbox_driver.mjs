// SPDX-License-Identifier: LGPL-2.1
// #51: test_agent_sandbox.py's driver. Runs one Claude Code query through the installed
// agent SDK, wrapped by OwnStudio's own sandboxed() (node/agent-lookup.ts), so the test
// checks the options OwnStudio really passes. Usage: node claude_sandbox_driver.mjs <sdk folder> <setup>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const [sdkDir, setup] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { sandboxed } = require('../../packages/ownstudio-core/lib/node/agent-lookup.js');
const { query } = await import(pathToFileURL(path.join(sdkDir, 'sdk.mjs')).href);

const stream = sandboxed(query)({
    prompt: 'Run the probe.',
    options: {
        cwd: setup,
        permissionMode: 'default',
        settingSources: [],
        // The request asks for no sandbox: OwnStudio's sandbox must win.
        sandbox: { enabled: false },
        canUseTool: async (_tool, input) => ({ behavior: 'allow', updatedInput: input }),
        stderr: data => process.stderr.write(data),
    },
});
for await (const message of stream) {
    console.log(JSON.stringify({ type: message.type, subtype: message.subtype }));
    if (message.type === 'result') {
        break;
    }
}
