// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplication, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry,
    PerspectiveContribution, PerspectiveService, StatusBar, StatusBarAlignment, WidgetManager
} from '@theia/core/lib/browser';
import { WORKBENCHES, Workbench, commandId, perspectiveId, widgetId } from './workbenches';
import { ExpertModeContribution } from './expert-mode-contribution';

export type Target = 'simulator' | 'board';

/**
 * The workbench bar: Home · Design · Code · Lab along the bottom of the
 * window (as DaVinci Resolve's page bar), Ctrl+1…4, one Theia perspective
 * per workbench so each keeps its own layout. Also shows the target the Lab
 * runs on and the board connection, always visible on the right.
 */
@injectable()
export class WorkbenchContribution implements PerspectiveContribution, CommandContribution,
    KeybindingContribution, FrontendApplicationContribution {

    @inject(PerspectiveService) protected readonly perspectives: PerspectiveService;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(ExpertModeContribution) protected readonly expertMode: ExpertModeContribution;

    protected target: Target = 'simulator';

    registerPerspectives(service: PerspectiveService): void {
        for (const w of WORKBENCHES) {
            const placements = new Map<string, 'main' | 'left' | 'right' | 'bottom'>([[widgetId(w), 'main']]);
            if (w.id === 'code') {
                placements.set('explorer-view-container', 'left');
            }
            service.registerPerspective({
                id: perspectiveId(w),
                label: `OwnStudio: ${w.label}`,
                viewPlacements: placements,
                primaryViews: { main: widgetId(w) },
                // No chromeOptions.collapseAreas: in Theia 1.76 the switch awaits
                // collapsePanel() for each area, and collapsing an area that is
                // already collapsed only resolves at the next switch, so the
                // workbench appeared one switch late. Collapsing happens in
                // showOnly() instead, without waiting.
                //
                // The main area is shared by all perspectives (as Eclipse's editor area):
                // show only this workbench's view there; editors stay open across workbenches.
                onActivate: () => { this.showOnly(w); },
            });
        }
    }

    registerCommands(registry: CommandRegistry): void {
        for (const w of WORKBENCHES) {
            registry.registerCommand({ id: commandId(w), category: 'OwnStudio', label: `Open ${w.label}` },
                { execute: () => this.perspectives.switchPerspective(perspectiveId(w)) });
        }
        registry.registerCommand({ id: 'ownstudio.target.toggle', category: 'OwnStudio', label: 'Switch Target (Simulator / Board)' },
            { execute: () => { this.target = this.target === 'simulator' ? 'board' : 'simulator'; this.renderBar(); } });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        for (const w of WORKBENCHES) {
            registry.registerKeybinding({ command: commandId(w), keybinding: w.keybinding });
        }
    }

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        this.perspectives.onDidChangePerspective(id => this.renderBar(id));
        if (!this.byPerspective(this.perspectives.getActivePerspectiveId())) {
            await this.perspectives.switchPerspective(perspectiveId(WORKBENCHES[0]));
        }
        this.renderBar(this.perspectives.getActivePerspectiveId());
    }

    protected byPerspective(id: string): Workbench | undefined {
        return WORKBENCHES.find(w => perspectiveId(w) === id);
    }

    protected async showOnly(target: Workbench): Promise<void> {
        for (const w of WORKBENCHES) {
            if (w !== target) {
                this.widgets.tryGetWidget(widgetId(w))?.close();
            }
        }
        const widget = await this.widgets.getOrCreateWidget(widgetId(target));
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
        if (!this.expertMode.isExpert) {
            const collapse = target.id === 'code' ? ['right', 'bottom'] as const : ['left', 'right', 'bottom'] as const;
            for (const area of collapse) {
                if (this.shell.isExpanded(area)) {
                    this.shell.collapsePanel(area); // not awaited, see registerPerspectives
                }
            }
        }
    }

    protected renderBar(activeId: string = this.perspectives.getActivePerspectiveId()): void {
        const active = this.byPerspective(activeId);
        WORKBENCHES.forEach((w, i) => {
            const on = w === active;
            this.statusBar.setElement(`ownstudio.bar.${w.id}`, {
                text: `$(${w.icon}) ${w.label}`,
                alignment: StatusBarAlignment.LEFT,
                priority: 1000 - i,
                command: commandId(w),
                tooltip: `${w.purpose} (${w.keybinding.replace('ctrlcmd', 'Ctrl')})`,
                className: on ? 'ownstudio-bar-item ownstudio-bar-active' : 'ownstudio-bar-item',
            });
        });
        this.statusBar.setElement('ownstudio.target', {
            text: this.target === 'simulator' ? '$(circuit-board) Target: Simulator' : '$(plug) Target: Board',
            alignment: StatusBarAlignment.RIGHT,
            priority: 1000,
            command: 'ownstudio.target.toggle',
            tooltip: 'Where the Lab runs the firmware. Click to switch.',
        });
        this.statusBar.setElement('ownstudio.board', {
            text: '$(debug-disconnect) No board',
            alignment: StatusBarAlignment.RIGHT,
            priority: 999,
            tooltip: 'Board detection comes in step 2.',
        });
    }
}
