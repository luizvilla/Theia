// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { SAFETY_WIDGET_ID } from './safety-widget';

export const OPEN_SAFETY_COMMAND = { id: 'ownstudio.safety.open', category: 'OwnStudio', label: 'Open the Safety Panel' };

@injectable()
export class SafetyContribution implements CommandContribution {
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OPEN_SAFETY_COMMAND, { execute: () => this.open() });
    }

    async open(): Promise<void> {
        const widget = await this.widgets.getOrCreateWidget(SAFETY_WIDGET_ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
