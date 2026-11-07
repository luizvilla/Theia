// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { ApplicationShell, QuickInputService, Widget, WidgetManager } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MissionService } from './mission-service';
import { OPEN_DATA_OBJECTS_COMMAND, OPEN_PANEL_COMMAND } from './lab-widget';
import { PANEL_WIDGET_FACTORY, PanelWidgetOptions } from './panel-widget';
import { DATA_OBJECTS_WIDGET_ID } from './data-objects-widget';

@injectable()
export class LabContribution implements CommandContribution {
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(FileService) protected readonly files: FileService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OPEN_PANEL_COMMAND, { execute: (path?: string) => this.openPanel(path) });
        registry.registerCommand(OPEN_DATA_OBJECTS_COMMAND, { execute: async () => this.show(await this.widgets.getOrCreateWidget(DATA_OBJECTS_WIDGET_ID)) });
    }

    /** path: relative to the mission. Without one, pick among panels/*.panel.json. */
    protected async openPanel(path?: string): Promise<void> {
        if (!path) {
            const folder = this.missions.resolve('panels');
            const stat = folder && await this.files.exists(folder) ? await this.files.resolve(folder) : undefined;
            const names = (stat?.children ?? []).map(c => c.name).filter(n => n.endsWith('.panel.json'));
            const pick = names.length === 1 ? names[0]
                : (await this.quickInput.showQuickPick(names.map(n => ({ label: n })), { placeholder: 'Panel to open' }))?.label;
            if (!pick) {
                return;
            }
            path = `panels/${pick}`;
        }
        const uri = this.missions.resolve(path);
        if (uri) {
            const options: PanelWidgetOptions = { uri: uri.toString() };
            await this.show(await this.widgets.getOrCreateWidget(PANEL_WIDGET_FACTORY, options));
        }
    }

    protected async show(widget: Widget): Promise<void> {
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
