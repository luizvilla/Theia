// SPDX-License-Identifier: LGPL-2.1-only
// Plan U18: the History menu's Milestone…, Restore… and New branch…, and the
// timeline preview's place in the centre.
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { ApplicationShell, QuickInputService, QuickPickItem, WidgetManager } from '@theia/core/lib/browser';
import { TimelineModel } from './timeline-model.js';
import { OPEN_TIMELINE_PREVIEW } from './timeline-widget.js';
import { TIMELINE_PREVIEW_ID } from './timeline-preview-widget.js';
import { EVENT_STYLE, dotLabel } from '../common/timeline.js';

export const HISTORY_COMMANDS = {
    milestone: { id: 'ownstudio.history.milestone', label: 'Milestone…', category: 'History' },
    restore: { id: 'ownstudio.history.restore', label: 'Restore…', category: 'History' },
    newBranch: { id: 'ownstudio.history.newBranch', label: 'New branch…', category: 'History' },
};

@injectable()
export class TimelineContribution implements CommandContribution {
    @inject(TimelineModel) protected readonly model: TimelineModel;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(QuickInputService) protected readonly input: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    async open(): Promise<void> {
        const widget = await this.widgets.getOrCreateWidget(TIMELINE_PREVIEW_ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }

    registerCommands(registry: CommandRegistry): void {
        const needsSetup = () => !!this.model.folder;
        registry.registerCommand({ id: OPEN_TIMELINE_PREVIEW }, { execute: () => this.open() });
        registry.registerCommand(HISTORY_COMMANDS.milestone, {
            isEnabled: needsSetup,
            execute: async () => {
                const name = await this.input.input({ prompt: 'Name this milestone (a dot on the current state)', placeHolder: 'kp tuned' });
                if (name?.trim()) {
                    await this.model.milestone(name);
                }
            },
        });
        registry.registerCommand(HISTORY_COMMANDS.restore, {
            isEnabled: needsSetup,
            execute: async () => {
                const dots = [...(this.model.strip?.dots ?? [])].reverse();
                const items: (QuickPickItem & { commit: string })[] = dots.map(dot => ({
                    commit: dot.commit,
                    label: dotLabel(dot),
                    description: `${EVENT_STYLE[dot.event]?.label ?? dot.event} · ${new Date(dot.date).toLocaleString()}`,
                    detail: dot.commit === this.model.strip?.head ? 'now' : dot.commit.slice(0, 7),
                }));
                const picked = await this.input.showQuickPick(items, { placeholder: 'Restore the setup as it was at…' });
                if (picked && picked.commit !== this.model.strip?.head) {
                    await this.model.select(picked.commit);
                    await this.open();
                    await this.model.restore(picked.commit);
                }
            },
        });
        registry.registerCommand(HISTORY_COMMANDS.newBranch, {
            isEnabled: needsSetup,
            execute: async () => {
                const name = await this.input.input({ prompt: 'Continue on a new branch from here', placeHolder: 'try-47uH' });
                if (name?.trim() && await this.model.newBranch(name)) {
                    this.messages.info(`Now on ${this.model.strip?.branch}. The previous branch keeps its dots.`);
                }
            },
        });
    }
}
