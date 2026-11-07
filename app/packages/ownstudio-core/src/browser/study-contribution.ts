// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplicationContribution, StatusBar, StatusBarAlignment, WidgetManager
} from '@theia/core/lib/browser';
import { MISSION_STEPS_WIDGET_ID, OPEN_QUESTIONNAIRE_COMMAND, OPEN_STEPS_COMMAND } from './mission-steps-widget';
import { QUESTIONNAIRE_WIDGET_ID } from './questionnaire-widget';
import { MissionService } from './mission-service';
import { StudyModel } from './study-model';

/**
 * The mission steps: in the right sidebar, opened on demand, and always named in
 * the status bar ("Step 3/5: ..."), which opens them. The sidebar is not kept
 * open across workbench switches: in Theia 1.76 that makes a switch finish one
 * switch late (measured in step 4), and simple mode collapses side panels anyway.
 */
@injectable()
export class StudyContribution implements CommandContribution, FrontendApplicationContribution {
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(StudyModel) protected readonly study: StudyModel;

    async onDidInitializeLayout(): Promise<void> {
        const widget = await this.widgets.getOrCreateWidget(MISSION_STEPS_WIDGET_ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'right', rank: 100 });
        }
        this.study.onDidChange(() => this.renderStep());
        this.missions.onDidChange(() => this.renderStep());
        this.renderStep();
    }

    protected renderStep(): void {
        const steps = this.missions.mission?.steps ?? [];
        if (!steps.length) {
            this.statusBar.removeElement('ownstudio.step');
            return;
        }
        const index = this.study.current ? steps.findIndex(s => s.id === this.study.current)
            : steps.findIndex(s => !this.study.done.has(s.id));
        const text = index < 0 ? 'All steps done' : `Step ${index + 1}/${steps.length}: ${steps[index].title}`;
        this.statusBar.setElement('ownstudio.step', {
            text: `$(list-ordered) ${text}${this.study.participant ? ' $(record)' : ''}`,
            alignment: StatusBarAlignment.LEFT,
            priority: 900,
            command: OPEN_STEPS_COMMAND.id,
            tooltip: this.study.participant ? `Mission steps (study: participant ${this.study.participant})` : 'Mission steps',
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OPEN_STEPS_COMMAND, {
            execute: async () => {
                const widget = await this.widgets.getOrCreateWidget(MISSION_STEPS_WIDGET_ID);
                if (!widget.isAttached) {
                    await this.shell.addWidget(widget, { area: 'right', rank: 100 });
                }
                await this.shell.activateWidget(widget.id);
            },
        });
        registry.registerCommand(OPEN_QUESTIONNAIRE_COMMAND, {
            execute: async () => {
                const widget = await this.widgets.getOrCreateWidget(QUESTIONNAIRE_WIDGET_ID);
                if (!widget.isAttached) {
                    await this.shell.addWidget(widget, { area: 'main' });
                }
                await this.shell.activateWidget(widget.id);
            },
        });
    }
}
