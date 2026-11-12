// SPDX-License-Identifier: LGPL-2.1-only
// Plan U17 (SPEC §12, ADR 0010): the user's own Claude Code and Codex work in
// a setup, but OwnStudio never lets them run without asking (Claude Code) or
// outside their sandbox (Codex). Switching the converter on stays with the
// Lab's confirmation dialog; an agent has no way to that dialog's token.

/** Claude Code's modes OwnStudio offers. `bypassPermissions` is never used. */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan';
const CLAUDE_MODES: readonly string[] = ['default', 'acceptEdits', 'plan'];

/** The mode a Claude Code request runs in: anything else, `bypassPermissions` included, asks first. */
export function claudePermissionMode(modeId: string | undefined): ClaudePermissionMode {
    return CLAUDE_MODES.includes(modeId ?? '') ? modeId as ClaudePermissionMode : 'default';
}

/** Codex's sandboxes OwnStudio offers. `danger-full-access` (no sandbox) is never used. */
export type CodexSandboxMode = 'workspace-write' | 'read-only';
export const CODEX_MODES: { id: CodexSandboxMode; name: string }[] = [
    { id: 'workspace-write', name: 'Workspace' },
    { id: 'read-only', name: 'Read-Only' },
];

/** The sandbox a Codex request runs in: anything else, full access included, is the workspace sandbox. */
export function codexSandboxMode(modeId: string | undefined): CodexSandboxMode {
    return modeId === 'read-only' ? 'read-only' : 'workspace-write';
}
