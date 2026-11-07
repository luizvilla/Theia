// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplication, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry,
    StatusBar, StatusBarAlignment, WidgetManager
} from '@theia/core/lib/browser';
import { WORKBENCHES, Workbench, commandId, widgetId } from './workbenches';
import { ExpertModeContribution } from './expert-mode-contribution';
import { MISSION_STEPS_WIDGET_ID } from './mission-steps-widget';

export type Target = 'simulator' | 'board';

/** Theia's explorer view container: the Code workbench shows it on the left. */
const EXPLORER_ID = 'explorer-view-container';

/**
 * The workbench bar: Home · Design · Code · Lab along the bottom of the
 * window (as DaVinci Resolve's page bar), Ctrl+1…4. Also shows the target the
 * Lab runs on, always visible on the right (the board entry is BoardContribution's).
 *
 * A workbench switch shows that workbench's view in the main area (editors stay
 * open across workbenches, as Eclipse's editor area) and, in simple mode,
 * collapses the side panels it does not use. It does not go through Theia's
 * perspectives: in Theia 1.76 a perspective switch awaits side-panel animations
 * that resolve only at the next switch, so the workbench appeared one switch
 * late with a fresh profile (luizvilla/Theia#13). Switches are queued, so quick
 * clicks land in order.
 */
@injectable()
export class WorkbenchContribution implements CommandContribution, KeybindingContribution, FrontendApplicationContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(ExpertModeContribution) protected readonly expertMode: ExpertModeContribution;

    protected target: Target = 'simulator';
    protected active: Workbench | undefined;
    protected queue: Promise<void> = Promise.resolve();

    registerCommands(registry: CommandRegistry): void {
        for (const w of WORKBENCHES) {
            registry.registerCommand({ id: commandId(w), category: 'OwnStudio', label: `Open ${w.label}` },
                { execute: () => this.switchTo(w) });
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
        await this.switchTo(WORKBENCHES[0]);
    }

    /** Show a workbench. The bar changes at once; the main area follows, switches in order. */
    switchTo(target: Workbench): Promise<void> {
        this.active = target;
        this.renderBar();
        this.queue = this.queue.catch(() => undefined).then(() => this.showOnly(target));
        return this.queue;
    }

    protected async showOnly(target: Workbench): Promise<void> {
        if (this.active !== target) {
            return;     // a later switch is queued: skip this one
        }
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
        if (target.id === 'code') {
            const explorer = await this.widgets.getOrCreateWidget(EXPLORER_ID).catch(() => undefined);
            if (explorer && !explorer.isAttached) {
                await this.shell.addWidget(explorer, { area: 'left' });
            }
            if (explorer) {
                this.shell.expandPanel('left');
            }
        }
        if (!this.expertMode.isExpert) {
            // The mission steps are the student's guide: if they are open on the right, they stay.
            const keepRight = this.shell.getWidgets('right').some(w => w.id === MISSION_STEPS_WIDGET_ID && w.isVisible);
            const collapse = (target.id === 'code' ? ['right', 'bottom'] as const : ['left', 'right', 'bottom'] as const)
                .filter(area => !(area === 'right' && keepRight));
            for (const area of collapse) {
                if (this.shell.isExpanded(area)) {
                    this.shell.collapsePanel(area); // not awaited: it can resolve only later
                }
            }
        }
    }

    protected renderBar(): void {
        WORKBENCHES.forEach((w, i) => {
            const on = w === this.active;
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
    }
}
