// SPDX-License-Identifier: LGPL-2.1-only
// The panels of the new window (plan U2, storyboard frame 0). Each one is the
// frame the later commits fill: Parts and the canvas get React Flow in U8, the
// inspector its details in U9, the timeline its dots in U18, the Lab panel its
// checklist in U11, the Design panel its sheets in U16.
import * as React from '@theia/core/shared/react';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { CANVAS_TINT, RIGHT_SLOTS, BOTTOM_SLOTS, WORKBENCH_SLOTS, WindowSlot, WorkbenchId } from '../common/window-layout';
import { iconClass } from './workbenches';

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

interface Part { name: string; colour: string; note: string; later?: boolean }
const PARTS: Part[] = [
    { name: 'DC source', colour: '#b2532a', note: 'on HIGH' },
    { name: 'Twist 1.4.2', colour: '#1f5a46', note: 'the board' },
    { name: 'Resistor', colour: '#2c6f9e', note: 'on LOW1' },
    { name: 'Oscilloscope', colour: '#8ea29c', note: 'later', later: true },
];

@injectable()
export class PartsWidget extends WindowPanel {
    protected readonly slot = RIGHT_SLOTS[0];

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            {PARTS.map(p => <div key={p.name} className={'ownstudio-part' + (p.later ? ' ownstudio-later' : '')}
                data-part={p.name}>
                <span className='ownstudio-dot' style={{ background: p.colour }} />{p.name}<small>{p.note}</small>
            </div>)}
            <p className='ownstudio-muted'>Drag a part onto the setup canvas. Wires that break the rules do not snap.
                Dragging arrives with the canvas.</p>
        </div>;
    }
}

@injectable()
export class InspectorWidget extends WindowPanel {
    protected readonly slot = RIGHT_SLOTS[1];
    protected selection: string | undefined;

    select(selection: string | undefined): void {
        this.selection = selection;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            {this.selection && <div className='ownstudio-panel-head'>{this.selection}</div>}
            <p className='ownstudio-muted' data-inspector-empty={!this.selection}>
                {this.selection ? 'Details of the selected block.' : 'Select a block on the canvas to see its details.'}</p>
        </div>;
    }
}

@injectable()
export class CanvasWidget extends WindowPanel {
    protected readonly slot = BOTTOM_SLOTS[0];
    protected workbench: WorkbenchId = 'code';

    setWorkbench(workbench: WorkbenchId): void {
        this.workbench = workbench;
        this.node.style.setProperty('--ownstudio-canvas', CANVAS_TINT[workbench]);
        this.node.dataset.workbench = workbench;
        this.update();
    }

    protected render(): React.ReactNode {
        const label = WORKBENCH_SLOTS.find(w => w.id === this.workbench)?.label;
        return <div className='ownstudio-canvas'>
            <div className='ownstudio-canvas-empty'>
                <div className='ownstudio-panel-head'>Setup canvas</div>
                <p className='ownstudio-muted'>No setup open. A setup shows its source, Twist and load here,
                    the same in every workbench.</p>
            </div>
            <span className='ownstudio-canvas-label'>{label}</span>
        </div>;
    }
}

export const TIMELINE_WIDGET_ID = 'ownstudio.timeline';

/** The timeline strip under the bottom panel (SPEC §13), always visible. */
@injectable()
export class TimelineWidget extends ReactWidget {
    @postConstruct()
    protected init(): void {
        this.id = TIMELINE_WIDGET_ID;
        this.addClass('ownstudio-timeline');
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ownstudio-timeline-body'>
            <span className='ownstudio-timeline-line' />
            <span className='ownstudio-muted'>Timeline · no setup open</span>
        </div>;
    }
}

@injectable()
export class DesignPanelWidget extends WindowPanel {
    protected readonly slot = WORKBENCH_SLOTS[0];

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            <div className='ownstudio-panel-head'>Design sheets</div>
            <div className='ownstudio-part'>Output filter<small>L, C, ripple</small></div>
            <div className='ownstudio-part'>Control loop<small>PI, Bode</small></div>
            <p className='ownstudio-muted'>Live sheets over the board's design scripts. Their values reach the canvas and the plant.</p>
        </div>;
    }
}

@injectable()
export class LabPanelWidget extends WindowPanel {
    protected readonly slot = WORKBENCH_SLOTS[2];

    protected render(): React.ReactNode {
        return <div className='ownstudio-panel-body'>
            <div className='ownstudio-panel-head'>Lab checklist</div>
            <p className='ownstudio-muted'>Checked all the time once a setup is open: board, firmware, HIGH, outputs, load.
                Run turns green only while every line holds.</p>
            <div className='ownstudio-panel-head'>Procedures</div>
            <p className='ownstudio-muted'>The setup's procedures and test sequences.</p>
        </div>;
    }
}
