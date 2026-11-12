// SPDX-License-Identifier: LGPL-2.1-only
// Plan U17: the user's Claude Code and Codex, through their own accounts, with
// OwnStudio's limits (common/agent-policy.ts). Theia's agents do the work; these
// subclasses only take away the modes that skip approval or the sandbox.
import { injectable } from '@theia/core/shared/inversify';
import { ClaudeCodeChatAgent } from '@theia/ai-claude-code/lib/browser/claude-code-chat-agent';
import { CodexChatAgent } from '@theia/ai-codex/lib/browser/codex-chat-agent';
import { MutableChatRequestModel } from '@theia/ai-chat/lib/common';
import { CODEX_MODES, claudePermissionMode, codexSandboxMode } from '../../common/agent-policy.js';

@injectable()
export class OwnStudioClaudeCodeChatAgent extends ClaudeCodeChatAgent {
    protected override getClaudePermissionMode(request: MutableChatRequestModel): ReturnType<ClaudeCodeChatAgent['getClaudePermissionMode']> {
        return claudePermissionMode(request.request.modeId);
    }
}

@injectable()
export class OwnStudioCodexChatAgent extends CodexChatAgent {
    override modes = CODEX_MODES;

    protected override extractSandboxMode(modeId?: string): 'read-only' | 'workspace-write' | 'danger-full-access' {
        return codexSandboxMode(modeId);
    }
}
