// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { LabChecklistModel } from './lab-checklist-model';
import { ProcedureModel } from './procedure-model';

/** Keeps the status bar's "Lab checklist n/6" entry in step with the panel. */
@injectable()
export class LabChecklistContribution implements FrontendApplicationContribution {
    @inject(LabChecklistModel) protected readonly checklist: LabChecklistModel;
    @inject(ProcedureModel) protected readonly procedures: ProcedureModel;
    @inject(StatusBar) protected readonly statusBar: StatusBar;

    onStart(): void {
        this.checklist.onDidChange(() => this.render());
        this.procedures.onDidChange(() => this.render());
        this.render();
    }

    onStop(): void {
        this.statusBar.removeElement('ownstudio.lab-checklist');
    }

    protected render(): void {
        const procedure = this.procedures.procedures.find(p => p.targets?.includes('board'));
        const checks = this.checklist.checks(procedure);
        const count = checks.filter(check => check.ok).length;
        const failed = checks.filter(check => !check.ok);
        this.statusBar.setElement('ownstudio.lab-checklist', {
            text: `${failed.length ? '$(error)' : '$(check)'} Lab checklist ${count}/${checks.length}`,
            tooltip: failed.length ? failed.map(check => `${check.label}: ${check.sentence}`).join('\n') : 'Every Lab check holds.',
            className: failed.length ? 'ownstudio-board-warning' : undefined,
            alignment: StatusBarAlignment.RIGHT,
            priority: 998,
        });
    }
}
