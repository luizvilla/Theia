// SPDX-License-Identifier: LGPL-2.1-only
// F7 (Q180): Claude Code in the AI tab uses the agent SDK that comes with OwnStudio
// (app dependency @anthropic-ai/claude-agent-sdk), so nobody runs `npm install -g` first.
// Theia looks at the ai-features.claudeCode.executablePath setting, then at the global npm
// folder; its service is bound per connection, so OwnStudio wraps the global lookup: the
// bundled SDK first, Theia's own lookup after. A path in the settings still wins.
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeCodeServiceImpl } from '@theia/ai-claude-code/lib/node/claude-code-service-impl.js';

const SDK = path.join('node_modules', '@anthropic-ai', 'claude-agent-sdk');

/** The SDK folder beside the app: searched upwards from the backend's main.js and from the working folder. */
export function bundledClaudeSdk(starts: string[] = defaultStarts()): string | undefined {
    for (const start of starts) {
        for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
            const candidate = path.join(dir, SDK);
            if (fs.existsSync(path.join(candidate, 'sdk.mjs'))) {
                return candidate;
            }
            if (path.dirname(dir) === dir) {
                break;
            }
        }
    }
    return undefined;
}

function defaultStarts(): string[] {
    const main = process.argv.find(a => /[\\/]lib[\\/]backend[\\/]main\.js$/.test(a));
    return [main ? path.dirname(main) : undefined, process.cwd()].filter((s): s is string => !!s);
}

/** Once, at backend start: Theia's global-npm lookup falls back to it, not the other way round. */
export function preferBundledClaudeSdk(): void {
    const proto = ClaudeCodeServiceImpl.prototype as unknown as { resolveClaudeCodePath(): string; ownstudioWrapped?: boolean };
    if (proto.ownstudioWrapped) {
        return;
    }
    const theirs = proto.resolveClaudeCodePath;
    proto.resolveClaudeCodePath = function (this: unknown): string {
        return bundledClaudeSdk() ?? theirs.call(this);
    };
    proto.ownstudioWrapped = true;
}
