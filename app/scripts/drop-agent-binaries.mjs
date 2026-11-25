// SPDX-License-Identifier: LGPL-2.1-only
// #47 (ADR 0031 amendment): OwnStudio ships no agent. Theia's @theia/ai-codex depends on
// @openai/codex-sdk 0.49, whose vendor/ holds Codex binaries for six platforms (223 MB).
// OwnStudio keeps the SDK's JavaScript and runs the Codex the student installs from the
// AI tab (codexPathOverride), so the binaries go. Runs after every npm install in app/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(app, 'node_modules', '@openai', 'codex-sdk', 'vendor');
if (fs.existsSync(vendor)) {
    fs.rmSync(vendor, { recursive: true, force: true });
    console.log('OwnStudio ships no agent: dropped @openai/codex-sdk/vendor (the Codex 0.49 binaries).');
}
