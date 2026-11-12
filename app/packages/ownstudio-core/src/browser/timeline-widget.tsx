// SPDX-License-Identifier: LGPL-2.1-only
// The timeline strip under the bottom panel (SPEC §13, plan U18, frame 14):
// one dot per event of the line being worked on, the latest on the right.
// A click previews the dot; while an old dot is restored, "Back to latest" shows.
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common';
import { TimelineModel } from './timeline-model.js';
import { EVENT_STYLE, dotLabel } from '../common/timeline.js';

export const TIMELINE_WIDGET_ID = 'ownstudio.timeline';

/** Opens the dot preview in the centre. A command, so the strip (owned by the shell) does not depend on the shell. */
export const OPEN_TIMELINE_PREVIEW = 'ownstudio.timeline.openPreview';

@injectable()
export class TimelineWidget extends ReactWidget {
    @inject(TimelineModel) protected readonly model: TimelineModel;
    @inject(CommandService) protected readonly commands: CommandService;

    protected scroller: HTMLDivElement | null = null;
    protected lastCount = 0;

    @postConstruct()
    protected init(): void {
        this.id = TIMELINE_WIDGET_ID;
        this.addClass('ownstudio-timeline');
        this.model.onDidChange(() => this.update());
        this.update();
    }

    protected override onUpdateRequest(msg: Parameters<ReactWidget['onUpdateRequest']>[0]): void {
        super.onUpdateRequest(msg);
        // New dots arrive on the right: keep the latest in view.
        const count = this.model.strip?.dots.length ?? 0;
        if (count !== this.lastCount && this.scroller) {
            this.lastCount = count;
            requestAnimationFrame(() => this.scroller && (this.scroller.scrollLeft = this.scroller.scrollWidth));
        }
    }

    protected async pick(commit: string): Promise<void> {
        await this.model.select(commit);
        await this.commands.executeCommand(OPEN_TIMELINE_PREVIEW);
    }

    protected render(): React.ReactNode {
        const strip = this.model.strip;
        if (!strip) {
            return <div className='ownstudio-timeline-body'>
                <span className='ownstudio-timeline-line' />
                <span className='ownstudio-muted'>Timeline</span>
            </div>;
        }
        const where = strip.branch ?? `${strip.restored_from ?? 'detached'} · restored`;
        return <div className='ownstudio-timeline-body' data-head={strip.head} data-detached={strip.detached} data-dots={strip.dots.length}>
            <span className='ownstudio-timeline-branch' title='Branch'><span className={codicon('git-branch')} /> {where}</span>
            <div className='ownstudio-timeline-dots' ref={e => { this.scroller = e; }}>
                {strip.dots.map(dot => {
                    const style = EVENT_STYLE[dot.event] ?? { colour: '#8ea29c', label: dot.event };
                    const classes = ['ownstudio-timeline-dot', `ownstudio-dot-${dot.event}`];
                    if (dot.commit === strip.head) { classes.push('ownstudio-timeline-head'); }
                    if (dot.commit === this.model.selected) { classes.push('ownstudio-timeline-selected'); }
                    const when = new Date(dot.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    return <button key={dot.commit} className={classes.join(' ')} data-commit={dot.commit} data-event={dot.event}
                        title={`${style.label} · ${dot.summary} · ${when} · ${dot.commit.slice(0, 7)}`}
                        onClick={() => this.pick(dot.commit)}>
                        <i style={{ background: style.colour }} className={dot.event === 'milestone' ? 'ownstudio-timeline-diamond' : ''} />
                        <span>{dotLabel(dot)}</span>
                    </button>;
                })}
            </div>
            {strip.detached && strip.restored_from && <button className='theia-button secondary ownstudio-timeline-back' data-action='back'
                disabled={this.model.busy} onClick={() => this.model.back()}>Back to latest</button>}
        </div>;
    }
}
