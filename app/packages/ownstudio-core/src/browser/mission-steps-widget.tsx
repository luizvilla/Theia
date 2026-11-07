// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ApplicationShell, OpenerService, codicon, open } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common';
import { MissionService } from './mission-service';
import { StudyModel } from './study-model';
import { MissionStep } from './mission';
import { WORKBENCHES, commandId } from './workbenches';
import { stepTimes } from '../common/study';

export const MISSION_STEPS_WIDGET_ID = 'ownstudio.mission-steps';
export const OPEN_QUESTIONNAIRE_COMMAND = { id: 'ownstudio.study.questionnaire', category: 'OwnStudio', label: 'Open the Study Questionnaire' };
export const OPEN_STEPS_COMMAND = { id: 'ownstudio.steps.open', category: 'OwnStudio', label: 'Show the Mission Steps' };

/**
 * The mission's steps (mission.yaml), in order: start one to open its workbench
 * and file, mark it done when finished. With the study's consent, starts and
 * "done" are logged (StudyModel); without it nothing is recorded.
 */
@injectable()
export class MissionStepsWidget extends ReactWidget {
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(StudyModel) protected readonly study: StudyModel;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    protected code = '';
    protected agreed = false;
    protected folder = '';

    @postConstruct()
    protected init(): void {
        this.id = MISSION_STEPS_WIDGET_ID;
        this.title.label = 'Mission steps';
        this.title.caption = 'The steps of the mission, in order';
        this.title.iconClass = codicon('list-ordered');
        this.title.closable = true;
        this.addClass('ownstudio-steps');
        this.study.onDidChange(() => this.update());
        this.study.folder().then(uri => { this.folder = uri.path.fsPath(); this.update(); });
        this.update();
    }

    protected async startStep(step: MissionStep): Promise<void> {
        await this.study.start(step.id);
        // Close this panel before switching: in Theia 1.76 a workbench switch that has to
        // collapse an open side panel finishes one switch late. (Bounded wait, in case the
        // collapse never reports back.)
        if (this.shell.isExpanded('right')) {
            await Promise.race([this.shell.collapsePanel('right'), new Promise(r => setTimeout(r, 500))]);
        }
        const bench = WORKBENCHES.find(w => w.id === step.workbench);
        if (bench) {
            // Not awaited: a perspective switch can report its end much later than it shows.
            this.commands.executeCommand(commandId(bench));
        }
        const uri = step.opens ? this.missions.resolve(step.opens) : undefined;
        if (uri) {
            await open(this.opener, uri);
        }
    }

    protected render(): React.ReactNode {
        const steps = this.missions.mission?.steps ?? [];
        if (!steps.length) {
            return <div className='ownstudio-steps-body'><p className='ownstudio-muted'>This mission lists no steps (mission.yaml, steps).</p></div>;
        }
        const times = new Map(stepTimes(this.study.events).map(t => [t.step, t]));
        return <div className='ownstudio-steps-body'>
            {this.renderStudy(steps.length)}
            <ol className='ownstudio-steps-list'>
                {steps.map((s, i) => {
                    const done = this.study.done.has(s.id);
                    const current = this.study.current === s.id;
                    const bench = WORKBENCHES.find(w => w.id === s.workbench);
                    const spent = times.get(s.id)?.seconds;
                    return <li key={s.id} className={`ownstudio-step${done ? ' ownstudio-step-done' : ''}${current ? ' ownstudio-step-current' : ''}`}>
                        <div className='ownstudio-step-title'>
                            <span className='ownstudio-step-mark' aria-hidden>{done ? '✓' : current ? '▶' : String(i + 1)}</span>
                            <b>{s.title}</b>
                            <span className='ownstudio-muted'> · {bench?.label ?? s.workbench}{s.target ? `, on the ${s.target}` : ''}
                                {done ? ' · done' : current ? ' · in progress' : ''}{spent !== undefined ? ` · ${Math.round(spent / 60)} min` : ''}</span>
                        </div>
                        {s.detail && (current || !done) && <p className='ownstudio-step-detail'>{s.detail}</p>}
                        <div className='ownstudio-button-row'>
                            <button className={`theia-button${current ? ' secondary' : ''}`} onClick={() => this.startStep(s)}>
                                {done ? 'Open again' : current ? 'Open' : 'Start'}</button>
                            {current && <button className='theia-button' onClick={() => this.study.finish(s.id)}>Done</button>}
                        </div>
                    </li>;
                })}
            </ol>
        </div>;
    }

    protected renderStudy(total: number): React.ReactNode {
        const p = this.study.participant;
        if (p) {
            const allDone = this.study.done.size >= total;
            return <div className='ownstudio-card ownstudio-study'>
                <div className='ownstudio-card-title'><span className={codicon('record')} /> Study: participant <code>{p}</code></div>
                <p className='ownstudio-muted'>Recording when you start and finish each step, on this computer only.</p>
                {this.study.problem && <p className='ownstudio-problem'>{this.study.problem}</p>}
                <div className='ownstudio-button-row'>
                    <button className={`theia-button${allDone ? '' : ' secondary'}`}
                        onClick={() => this.commands.executeCommand(OPEN_QUESTIONNAIRE_COMMAND.id)}>Questionnaire</button>
                    <button className='theia-button secondary' onClick={async () => {
                        const uri = await this.study.exportCsv();
                        if (uri) {
                            await open(this.opener, uri);
                        }
                    }}>Export step times</button>
                    <button className='theia-button secondary' onClick={() => this.study.withdraw()}
                        title='Stop the study and delete what was recorded'>Withdraw</button>
                </div>
            </div>;
        }
        return <details className='ownstudio-card ownstudio-study'>
            <summary>Taking part in the study? (optional)</summary>
            <p>If you take part, OwnStudio records the time you start and finish each step below, and your answers to a
                short questionnaire at the end. Nothing else is recorded: not your code, not your screen. The record stays
                on this computer, in <code>{this.folder || 'the OwnStudio settings folder'}</code>, under the code the
                facilitator gives you, never your name. You can withdraw at any time; that deletes the record.</p>
            <label>Participant code <input className='theia-input' value={this.code} placeholder='P03' aria-label='Participant code'
                onChange={e => { this.code = e.currentTarget.value.trim(); this.update(); }} /></label>
            <label className='ownstudio-study-agree'><input type='checkbox' checked={this.agreed}
                onChange={e => { this.agreed = e.currentTarget.checked; this.update(); }} /> I have read the consent sheet and I agree to take part.</label>
            {this.study.problem && <p className='ownstudio-problem'>{this.study.problem}</p>}
            <button className='theia-button' disabled={!this.agreed || !this.code}
                onClick={() => this.study.consent(this.code)}>Start the study</button>
        </details>;
    }
}
