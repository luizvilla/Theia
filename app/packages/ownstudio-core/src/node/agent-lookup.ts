// SPDX-License-Identifier: LGPL-2.1-only
// #47 (ADR 0031 amendment; replaces F7's bundled SDK): Theia's Claude Code and Codex
// services run the agents the student installed from the AI tab, in OwnStudio's folder.
// Both services are bound per connection, so OwnStudio patches their prototypes once:
// - Claude Code: a path in the ai-features.claudeCode.executablePath setting still wins
//   (Theia checks it first); otherwise the installed SDK. No global npm lookup: OwnStudio
//   runs the pinned version, on which the sandbox probe passed.
// - Codex: Theia's `new Codex()` takes no path (it runs the binary inside @openai/codex-sdk
//   0.49), so the request runs the installed binary through codexPathOverride. The 0.49 SDK
//   starts it as the current SDK does (`codex exec --experimental-json`).
import { ClaudeCodeServiceImpl } from '@theia/ai-claude-code/lib/node/claude-code-service-impl.js';
import { CodexServiceImpl } from '@theia/ai-codex/lib/node/codex-service-impl.js';
import type { CodexBackendRequest, CodexClient } from '@theia/ai-codex/lib/common/codex-service.js';
import type { CodexOptions, Thread } from '@openai/codex-sdk';
import { AGENT_PINS, AgentId } from '../common/agent-pins.js';
import { findAgent } from './agent-installer.js';

export type FindAgent = (id: AgentId) => string | undefined;

/** The message when an agent is missing: the AI tab offers the install on the next request. */
export function notInstalled(id: AgentId): string {
    const label = AGENT_PINS[id].label;
    return `${label} is not installed. Send your message again and choose "Install ${label}" in the AI tab.`;
}

export function codexOptions(find: FindAgent): CodexOptions {
    const codexPathOverride = find('codex');
    if (!codexPathOverride) {
        throw new Error(notInstalled('codex'));
    }
    return { codexPathOverride };
}

/** Theia's CodexServiceImpl internals that sendMessages uses. */
interface CodexInternals {
    client: CodexClient;
    logger: { info(...args: unknown[]): void; error(...args: unknown[]): void };
    sessionThreads: Map<string, Thread>;
    abortControllers: Map<string, AbortController>;
    cleanup(streamId: string): void;
}

/** Once, at backend start (tests call it again with their own finder). */
export function useInstalledAgents(find: FindAgent = id => findAgent(id)): void {
    const claude = ClaudeCodeServiceImpl.prototype as unknown as { resolveClaudeCodePath(): string };
    claude.resolveClaudeCodePath = function (): string {
        const sdk = find('claude');
        if (!sdk) {
            throw new Error(notInstalled('claude'));
        }
        return sdk;
    };

    // Theia 1.77's sendMessages, with the installed binary. Keep in step with Theia on upgrade.
    const codex = CodexServiceImpl.prototype as unknown as { sendMessages(streamId: string, request: CodexBackendRequest): Promise<void> };
    codex.sendMessages = async function (this: CodexInternals, streamId: string, request: CodexBackendRequest): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(streamId, abortController);
        try {
            const options = codexOptions(find);
            const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@openai/codex-sdk')>;
            const { Codex } = await dynamicImport('@openai/codex-sdk');
            const sessionId = request.sessionId || streamId;
            let thread = this.sessionThreads.get(sessionId);
            if (!thread) {
                thread = new Codex(options).startThread(request.options);
                this.sessionThreads.set(sessionId, thread);
            }
            const { events } = await thread.runStreamed(request.prompt);
            for await (const event of events) {
                if (abortController.signal.aborted) {
                    break;
                }
                this.client.sendToken(streamId, event as Parameters<CodexClient['sendToken']>[1]);
                const type = (event as { type?: string }).type;
                if (type === 'turn.completed' || type === 'turn.failed') {
                    break;
                }
            }
            this.client.sendToken(streamId, undefined);
        } catch (e) {
            this.logger.error('Codex error:', e);
            this.client.sendError(streamId, e instanceof Error ? e : new Error(String(e)));
        } finally {
            this.cleanup(streamId);
        }
    };
}
