// SPDX-License-Identifier: LGPL-2.1-only
// Plan U18, frame 14: one dot compared with now. Its canvas values, the files
// that differ and their diff; "Restore here" goes back to it without losing
// anything (S7), "Back to latest" returns, "Milestone…" names the current dot.
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { codicon, QuickInputService } from '@theia/core/lib/browser';
import { TimelineModel } from './timeline-model.js';
import { InspectorWidget } from './window-widgets.js';
import { EVENT_STYLE } from '../common/timeline.js';
import { normaliseCanvas, partDef } from '../common/canvas-model.js';
import { eng } from '../common/units.js';

export const TIMELINE_PREVIEW_ID = 'ownstudio.timeline.preview';

@injectable()
export class TimelinePreviewWidget extends ReactWidget {
    @inject(TimelineModel) protected readonly model: TimelineModel;
    @inject(InspectorWidget) protected readonly inspector: InspectorWidget;
    @inject(QuickInputService) protected readonly input: QuickInputService;

    @postConstruct()
    protected init(): void {
        this.id = TIMELINE_PREVIEW_ID;
        this.title.label = 'Timeline preview';
        this.title.iconClass = codicon('history');
        this.title.closable = true;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-timeline-preview');
        this.model.onDidChange(() => { this.update(); this.showInInspector(); });
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
        this.showInInspector();
    }

    protected showInInspector(): void {
        const p = this.model.preview;
        if (!p || !this.isVisible) {
            return;
        }
        const style = EVENT_STYLE[p.event] ?? { label: p.event };
        this.inspector.select(`Dot · ${p.summary}`, [
            ['Event', style.label], ['Commit', p.short], ['When', new Date(p.date).toLocaleString()],
            ['Compared with now', p.head ? 'this is now' : `${p.files.length} file(s) differ`],
        ], p.head ? [] : [{ label: 'Restore here', run: () => this.model.restore(p.commit) }]);
    }

    protected async askMilestone(): Promise<void> {
        const name = await this.input.input({ prompt: 'Name this milestone', placeHolder: 'kp tuned' });
        if (name?.trim()) {
            await this.model.milestone(name);
        }
    }

    protected render(): React.ReactNode {
        const p = this.model.preview;
        const strip = this.model.strip;
        if (!p || !strip) {
            return <div className='ownstudio-workbench-body'><p className='ownstudio-muted'>Click a dot on the timeline.</p></div>;
        }
        const latest = strip.dots[strip.dots.length - 1]?.commit;
        const canvas = normaliseCanvas(p.canvas);
        return <div className='ownstudio-workbench-body' data-preview={p.commit} data-head={p.head}>
            <h1 className='ownstudio-title'>Timeline preview</h1>
            <p className='ownstudio-workbench-purpose'>{p.summary} · <code>{p.short}</code> · {new Date(p.date).toLocaleString()} · compared with now</p>
            <div className='ownstudio-button-row'>
                <button className='theia-button' data-action='restore' disabled={p.head || this.model.busy}
                    onClick={() => this.model.restore(p.commit)}
                    title='Shows the setup as it was here. Unsaved work is kept first; a branch starts only if you edit from here.'>
                    <span className={codicon('history')} /> Restore here</button>
                {strip.detached && strip.restored_from && <button className='theia-button secondary' data-action='back'
                    disabled={this.model.busy} onClick={() => this.model.back()}>Back to latest</button>}
                {p.head && <button className='theia-button secondary' data-action='milestone' disabled={this.model.busy}
                    onClick={() => this.askMilestone()}><span className={codicon('milestone')} /> Milestone…</button>}
                {p.commit === latest && p.head && <span className='ownstudio-muted'>This is the latest dot.</span>}
            </div>
            <h2 className='ownstudio-emphasis'>The canvas then</h2>
            <table className='ownstudio-table'><tbody>{canvas.nodes.map(n => {
                const def = partDef(n.part);
                const values = (def?.values ?? []).map(v => `${v.label} ${eng(n.values?.[v.key] ?? v.default, v.unit)}`).join(' · ');
                return <tr key={n.id}><td>{def?.label ?? n.part}</td><td>{values}</td></tr>;
            })}</tbody></table>
            <h2 className='ownstudio-emphasis'>What differs from now</h2>
            {!p.files.length ? <p className='ownstudio-muted'>Nothing: the files are as they are now.</p> :
                <pre className='ownstudio-diff'>{p.diff.split('\n').map((line, i) => <div key={i} className={diffClass(line)}>{line || ' '}</div>)}</pre>}
            {p.truncated && <p className='ownstudio-muted'>The diff is longer; the first lines are shown.</p>}
            <p className='ownstudio-muted'>Records stay out of git; the reports and the commit reproduce any dot.</p>
        </div>;
    }
}

function diffClass(line: string): string {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        return 'os-diff-meta';
    }
    return line.startsWith('+') ? 'os-diff-add' : line.startsWith('-') ? 'os-diff-del' : line.startsWith('@@') ? 'os-diff-hunk' : '';
}
