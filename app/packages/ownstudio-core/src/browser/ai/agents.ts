// SPDX-License-Identifier: LGPL-2.1-only
// Plan U17: the user's Claude Code and Codex, through their own accounts, with
// OwnStudio's limits (common/agent-policy.ts). Theia's agents do the work; these
// subclasses take away the modes that skip approval or the sandbox and, since #47,
// offer to install the agent (one click, pinned version) when it is not there yet.
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, MessageService } from '@theia/core/lib/common';
import { ClaudeCodeChatAgent } from '@theia/ai-claude-code/lib/browser/claude-code-chat-agent';
import { CodexChatAgent } from '@theia/ai-codex/lib/browser/codex-chat-agent';
import {
    ChatAgentService, ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl, MutableChatRequestModel, QuestionResponseContentImpl
} from '@theia/ai-chat/lib/common';
import { CODEX_MODES, claudePermissionMode, codexSandboxMode } from '../../common/agent-policy.js';
import { AgentId } from '../../common/agent-pins.js';
import { AgentInstallClient, AgentInstallProgress, AgentInstallService } from '../../common/agent-install-protocol.js';
import { installOffer, installProgressText } from '../../common/agent-install-offer.js';
import { sandboxOffer } from '../../common/sandbox-offer.js';

@injectable()
export class AgentInstallClientImpl implements AgentInstallClient {
    protected readonly progress = new Emitter<AgentInstallProgress>();
    readonly onDidProgress = this.progress.event;
    onProgress(progress: AgentInstallProgress): void {
        this.progress.fire(progress);
    }
}

/** Runs the request when the agent is installed; otherwise offers the install in the response, then runs it. */
@injectable()
export class AgentInstallOffer {
    @inject(AgentInstallService) protected readonly service: AgentInstallService;
    @inject(AgentInstallClientImpl) protected readonly client: AgentInstallClientImpl;
    @inject(MessageService) protected readonly messages: MessageService;

    async runOrOffer(id: AgentId, request: MutableChatRequestModel, run: () => Promise<void>): Promise<void> {
        const status = await this.service.status(id);
        if (status.installed) {
            return run();
        }
        const offer = installOffer(status);
        const response = request.response;
        response.response.addContent(new MarkdownChatResponseContentImpl(offer.text));
        if (!offer.options.length) {
            response.complete();
            return;
        }
        const question = new QuestionResponseContentImpl(offer.question, offer.options, request, async choice => {
            question.selectedOption = choice;
            response.stopWaitingForInput();
            if (choice.value !== 'install') {
                response.complete();
                return;
            }
            try {
                await this.install(id, status.label);
                response.response.addContent(new MarkdownChatResponseContentImpl(`${status.label} ${status.version} is installed.`));
                await run();
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                response.response.addContent(new ErrorChatResponseContentImpl(error));
                response.error(error);
            }
        }, { onSkip: () => { response.stopWaitingForInput(); response.complete(); } });
        response.response.addContent(question);
        response.waitForInput();
    }

    /** #51: runs Claude Code only when its sandbox can start; otherwise says what is missing and offers the install. */
    async runSandboxed(request: MutableChatRequestModel, run: () => Promise<void>): Promise<void> {
        const status = await this.service.sandbox();
        if (status.supported && !status.missing.length) {
            return run();
        }
        const offer = sandboxOffer(status);
        const response = request.response;
        response.response.addContent(new MarkdownChatResponseContentImpl(offer.text));
        if (!offer.options.length) {
            response.complete();
            return;
        }
        const question = new QuestionResponseContentImpl(offer.question, offer.options, request, async choice => {
            question.selectedOption = choice;
            response.stopWaitingForInput();
            if (choice.value !== 'install') {
                response.complete();
                return;
            }
            const outcome = await this.service.installSandbox();
            const after = await this.service.sandbox();
            if (outcome === 'done' && !after.missing.length) {
                response.response.addContent(new MarkdownChatResponseContentImpl('The sandbox is ready.'));
                await run();
                return;
            }
            response.response.addContent(new MarkdownChatResponseContentImpl(sandboxOffer(after.missing.length ? after : status, outcome === 'done' ? 'failed' : outcome).text));
            response.complete();
        }, { onSkip: () => { response.stopWaitingForInput(); response.complete(); } });
        response.response.addContent(question);
        response.waitForInput();
    }

    protected async install(id: AgentId, label: string): Promise<void> {
        const progress = await this.messages.showProgress({ text: `Installing ${label}` });
        const listener = this.client.onDidProgress(p => {
            if (p.id === id) {
                progress.report({ message: installProgressText(p), work: p.total ? { done: p.received, total: p.total } : undefined });
            }
        });
        try {
            await this.service.install(id);
        } finally {
            listener.dispose();
            progress.cancel();
        }
    }
}

@injectable()
export class OwnStudioClaudeCodeChatAgent extends ClaudeCodeChatAgent {
    @inject(AgentInstallOffer) protected readonly installOffer: AgentInstallOffer;

    override async invoke(request: MutableChatRequestModel, chatAgentService?: ChatAgentService): Promise<void> {
        return this.installOffer.runOrOffer('claude', request,
            () => this.installOffer.runSandboxed(request, () => super.invoke(request, chatAgentService)));
    }

    protected override getClaudePermissionMode(request: MutableChatRequestModel): ReturnType<ClaudeCodeChatAgent['getClaudePermissionMode']> {
        return claudePermissionMode(request.request.modeId);
    }
}

@injectable()
export class OwnStudioCodexChatAgent extends CodexChatAgent {
    @inject(AgentInstallOffer) protected readonly installOffer: AgentInstallOffer;
    override modes = CODEX_MODES;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        return this.installOffer.runOrOffer('codex', request, () => super.invoke(request));
    }

    protected override extractSandboxMode(modeId?: string): 'read-only' | 'workspace-write' | 'danger-full-access' {
        return codexSandboxMode(modeId);
    }
}
