// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WORKBENCHES, widgetId } from './workbenches';
import { MissionService } from './mission-service';
import { BoardModel } from './board-model';
import { boardName } from '../common/board-protocol';
import { countStates, stateInfo } from '../common/test-states';
import { OPEN_CONTROL_CENTER_COMMAND } from './control-center-widget';
import { ProcedureModel, RUN_PROCEDURE_COMMAND } from './procedure-model';
import { LabChecklistModel } from './lab-checklist-model';

export const OPEN_PANEL_COMMAND = { id: 'ownstudio.panel.open', category: 'OwnStudio', label: 'Open a Panel…' };
export const OPEN_DATA_OBJECTS_COMMAND = { id: 'ownstudio.dataObjects.open', category: 'OwnStudio', label: 'Open the Data Object Table' };

/** The Lab workbench's main view: the board, the mission's panels, the data objects. */
@injectable()
export class LabWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(FileService) protected readonly files: FileService;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(ProcedureModel) protected readonly procedures: ProcedureModel;
    @inject(LabChecklistModel) protected readonly checklist: LabChecklistModel;

    protected panels: string[] = [];

    @postConstruct()
    protected init(): void {
        const lab = WORKBENCHES.find(w => w.id === 'lab')!;
        this.id = widgetId(lab);
        this.title.label = lab.label;
        this.title.caption = lab.purpose;
        this.title.iconClass = lab.iconClass;
        this.title.closable = false;
        this.addClass('ownstudio-workbench');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.findPanels());
        this.missions.onDidChangeFiles(uris => uris.some(u => u.path.toString().includes('/panels/')) && this.findPanels());
        this.board.onDidChange(() => this.update());
        this.procedures.onDidChange(() => this.update());
        this.checklist.onDidChange(() => this.update());
        this.findPanels();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async findPanels(): Promise<void> {
        const folder = this.missions.resolve('panels');
        try {
            const stat = folder ? await this.files.resolve(folder) : undefined;
            this.panels = (stat?.children ?? []).filter(c => c.name.endsWith('.panel.json')).map(c => c.name).sort();
        } catch {
            this.panels = [];
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const lab = WORKBENCHES.find(w => w.id === 'lab')!;
        const { link } = this.board;
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{lab.label}</h1>
            <p className='ownstudio-workbench-purpose'>{lab.purpose}</p>
            <h2 className='ownstudio-emphasis'>Board</h2>
            <p>{link ? <>{boardName(link.product)} on {link.port}: firmware {this.board.firmware === 'matches' ? 'matches the setup' : 'differs from the setup'}.</>
                : 'No board linked. Panels and the data object table go live when one is.'}
                {' '}{this.board.identity?.prebuilt && this.board.firmware !== 'matches' &&
                    <button className='theia-button secondary' onClick={() => this.commands.executeCommand('ownstudio.board.flash')}>Flash the pre-built firmware</button>}</p>
            <h2 className='ownstudio-emphasis'>Panels</h2>
            {!this.panels.length && <p className='ownstudio-muted'>This setup has no panels (panels/*.panel.json).</p>}
            <div className='ownstudio-button-row'>
                {this.panels.map(p => <button key={p} className='theia-button' onClick={() => this.commands.executeCommand(OPEN_PANEL_COMMAND.id, `panels/${p}`)}>
                    <span className={codicon('dashboard')} /> {p.replace(/\.panel\.json$/, '')}</button>)}
                <button className='theia-button secondary' onClick={() => this.commands.executeCommand(OPEN_DATA_OBJECTS_COMMAND.id)}>
                    <span className={codicon('symbol-field')} /> Data object table</button>
            </div>
            <h2 className='ownstudio-emphasis'>Procedures</h2>
            {this.procedures.problem && <p className='ownstudio-problem'>{this.procedures.problem}</p>}
            {!this.procedures.procedures.length && <p className='ownstudio-muted'>This board offers no default procedure and the setup has none of its own.</p>}
            {this.procedures.procedures.map(p => {
                const ready = this.checklist.ready(p);
                const blocker = this.checklist.blocker(p);
                return <div key={p.path} className='ownstudio-card ownstudio-procedure-card'>
                <div className='ownstudio-card-title'>{p.title}
                    {p.power_on && <span className='ownstudio-muted' title='Switches the converter on: on the board it asks first'>
                        <span className={codicon('zap')} /> switches power on</span>}</div>
                <div className='ownstudio-muted'>{p.doc}</div>
                {p.capture ? <div className='ownstudio-capture-form'>
                    <div><span className='ownstudio-field-label'>Channels</span> {p.capture.channels.map(c => c.label).join(' · ')}</div>
                    <div><span className='ownstudio-field-label'>Trigger</span> {p.capture.reference.name.replace(/^w/, '')}{' '}
                        {p.capture.reference.from} → {p.capture.reference.to} {p.capture.reference.unit}</div>
                    <div><span className='ownstudio-field-label'>Window</span> {(p.capture.duration_s * 1e3).toFixed(0)} ms ·{' '}
                        {(p.capture.pretrigger_s * 1e3).toFixed(0)} ms before · {(p.capture.sample_period_s * 1e6).toFixed(0)} µs/sample</div>
                </div> : <div className='ownstudio-muted'>Tests {p.tests.join(', ')} · <code>{p.path}</code></div>}
                <div className='ownstudio-button-row'>
                    {p.targets.map(t => <button key={t} className={`theia-button${t === 'board' ? ` ownstudio-run-${ready ? 'ready' : 'blocked'}` : ' secondary'}`}
                        data-run-target={t} data-ready={t === 'board' ? ready : true}
                        disabled={this.procedures.running || (t === 'board' && !ready)}
                        title={t === 'board' && blocker ? blocker.sentence : `Run on the ${t}`}
                        onClick={() => this.commands.executeCommand(RUN_PROCEDURE_COMMAND.id, p, t)}>
                        <span className={codicon(t === 'board' ? 'circuit-board' : 'play')} /> {p.capture ? 'Capture from' : 'Run on'} the {t}
                        {t === 'board' && blocker ? ` · ${blocker.sentence}` : ''}</button>)}
                </div>
            </div>;
            })}
            <h2 className='ownstudio-emphasis'>Tests</h2>
            <p>{this.missions.tests
                ? countStates(this.missions.tests.tests).map(s => `${stateInfo(s.id).word}: ${s.count}`).join(' · ')
                : this.missions.testsProblem ?? 'Reading the test catalogue…'}</p>
            <div className='ownstudio-button-row'>
                <button className='theia-button' onClick={() => this.commands.executeCommand(OPEN_CONTROL_CENTER_COMMAND.id)}>
                    <span className={codicon('checklist')} /> Control center</button>
            </div>
            <p className='ownstudio-muted'>A capture is filed under <code>ownstudio/records/</code>; its portable HTML report is in{' '}
                <code>ownstudio/reports/</code>. Open the result for cursors, channel controls, zoom and pan. Simulation overlay arrives in U15.</p>
        </div>;
    }
}
