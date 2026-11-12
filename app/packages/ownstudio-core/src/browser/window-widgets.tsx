// SPDX-License-Identifier: LGPL-2.1-only
// The panels of the new window (plan U2, storyboard frame 0). Each one is the
// frame the later commits fill: Parts and the canvas get React Flow in U8, the
// inspector its details in U9, the timeline its dots in U18, the Lab panel its
// checklist in U11, the Design panel its sheets in U16.
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { RIGHT_SLOTS, WORKBENCH_SLOTS, WindowSlot } from '../common/window-layout.js';
import { iconClass } from './workbenches.js';
import { LabChecklistModel } from './lab-checklist-model.js';
import { ProcedureModel } from './procedure-model.js';
import { DesignModel } from './design-model.js';

abstract class WindowPanel extends ReactWidget {
    protected abstract readonly slot: WindowSlot<string>;

    @postConstruct()
    protected init(): void {
        this.id = this.slot.widgetId;
        this.title.label = this.slot.label;
        this.title.caption = this.slot.tooltip;
        this.title.iconClass = iconClass(this.slot.icon);
        this.title.closable = false;
        this.addClass('ownstudio-panel');
        this.node.tabIndex = 0;
        this.update();
    }

    /** Theia's activateWidget() waits until the widget holds focus: take it. */
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }
}

/** Kept in step with canvas-widget.tsx's drop target. */
const PART_MIME = 'application/ownstudio-part';
interface Part { name: string; part?: string; colour: string; note: string }
const PARTS: Part[] = [
    { name: 'DC source', part: 'dc-source', colour: '#b2532a', note: 'on HIGH' },
    { name: 'Twist 1.4.2', part: 'twist', colour: '#1f5a46', note: 'the board' },
    { name: 'Resistor', part: 'resistor', colour: '#2c6f9e', note: 'on LOW1' },
    { name: 'Oscilloscope', colour: '#8ea29c', note: 'later' },
];

@injectable()
export class PartsWidget extends WindowPanel {
    protected readonly slot = RIGHT_SLOTS[0];

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            {PARTS.map(p => <div key={p.name} className={'ownstudio-part' + (p.part ? '' : ' ownstudio-later')}
                data-part={p.part ?? ''} draggable={!!p.part}
                onDragStart={e => { if (p.part) { e.dataTransfer.setData(PART_MIME, p.part); e.dataTransfer.effectAllowed = 'copy'; } }}>
                <span className='ownstudio-dot' style={{ background: p.colour }} />{p.name}<small>{p.note}</small>
            </div>)}
            <p className='ownstudio-muted'>Drag a part onto the setup canvas: one source on HIGH, one Twist, loads on LOW1 or LOW2.
                Wires that break the rules do not snap.</p>
        </div>;
    }
}

@injectable()
export class InspectorWidget extends WindowPanel {
    protected readonly slot = RIGHT_SLOTS[1];
    protected selection: string | undefined;
    protected rows: [string, string][] = [];
    protected actions: InspectorAction[] = [];

    select(selection: string | undefined, rows: [string, string][] = [], actions: InspectorAction[] = []): void {
        this.selection = selection;
        this.rows = rows;
        this.actions = actions;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body' data-inspector-selection={this.selection ?? ''}>
            {this.selection && <div className='ownstudio-panel-head'>{this.selection}</div>}
            {this.rows.map(([k, v]) => <div key={k} className='ownstudio-field'><span>{k}</span><b>{v}</b></div>)}
            {!!this.actions.length && <div className='ownstudio-inspector-actions'>
                {this.actions.map(action => <button key={action.label} onClick={action.run}>{action.label}</button>)}
            </div>}
            <p className='ownstudio-muted' data-inspector-empty={!this.selection}>
                {this.selection ? 'Read-only in slice 1.' : 'Select a block on the canvas to see its details.'}</p>
        </div>;
    }
}

export interface InspectorAction { label: string; run: () => void }

@injectable()
export class DesignPanelWidget extends WindowPanel {
    protected readonly slot = WORKBENCH_SLOTS[0];

    @inject(DesignModel) protected readonly design: DesignModel;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.design.onDidChange(() => this.update());
        void this.design.ready();
    }

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            <div className='ownstudio-panel-head'>Design sheets</div>
            {this.design.sheets.map(sheet => <div key={sheet.id} role='button' tabIndex={0} data-sheet={sheet.id}
                className={`ownstudio-part ownstudio-sheet-item${sheet.id === this.design.selected ? ' ownstudio-selected' : ''}`}
                onClick={() => this.design.select(sheet.id)} onKeyDown={e => e.key === 'Enter' && this.design.select(sheet.id)}>
                {sheet.label}<small>{SHEET_NOTES[sheet.id] ?? ''}</small></div>)}
            {!this.design.sheets.length && <p className='ownstudio-muted'>{this.design.problem ?? 'Open a setup to see its design sheets.'}</p>}
            <p className='ownstudio-muted'>Live sheets over the setup's own Python files in ownstudio/design/. Their L and C reach the canvas and the plant.</p>
        </div>;
    }
}

const SHEET_NOTES: Record<string, string> = { output_filter: 'L, C, ripple', control_loop: 'PI, Bode, margins' };

@injectable()
export class LabPanelWidget extends WindowPanel {
    protected readonly slot = WORKBENCH_SLOTS[2];

    @inject(LabChecklistModel) protected readonly checklist: LabChecklistModel;
    @inject(ProcedureModel) protected readonly procedures: ProcedureModel;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.checklist.onDidChange(() => this.update());
        this.procedures.onDidChange(() => this.update());
    }

    protected render(): React.ReactNode {
        const procedure = this.procedures.procedures.find(p => p.targets?.includes('board'));
        const checks = this.checklist.checks(procedure);
        return <div className='ownstudio-panel-body'>
            <div className='ownstudio-panel-head'>Lab checklist</div>
            <div className='ownstudio-lab-checks' data-ready={checks.every(check => check.ok)}>
                {checks.map(check => <div key={check.id} className={`ownstudio-lab-check ownstudio-lab-check-${check.ok ? 'ok' : 'bad'}`}
                    data-check={check.id} data-ok={check.ok}>
                    <span className='ownstudio-dot' /><span><b>{check.label}</b> · {check.sentence}</span>
                </div>)}
            </div>
            <div className='ownstudio-panel-head'>Procedures</div>
            {!this.procedures.procedures.length && <p className='ownstudio-muted'>No procedure yet. The default capture arrives with the next plan step.</p>}
            {this.procedures.procedures.map(p => <div key={p.path} className='ownstudio-procedure-item'>
                <span className='ownstudio-dot' /><span>{p.title}<small>{p.targets?.join(' · ')}</small></span>
            </div>)}
        </div>;
    }
}
