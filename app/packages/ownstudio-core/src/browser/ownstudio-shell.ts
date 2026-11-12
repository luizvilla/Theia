// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, Layout, Widget } from '@theia/core/lib/browser';
import { BoxPanel } from '@theia/core/shared/@lumino/widgets';
import { TheiaSplitPanel } from '@theia/core/lib/browser/shell/theia-split-panel';
import { TIMELINE_WIDGET_ID, TimelineWidget } from './timeline-widget.js';

/**
 * Theia's shell with the timeline strip (SPEC §13) under the centre and the
 * bottom panel, between the two side bars, as storyboard frame 0 draws it.
 * Only the column between the side bars changes: the bottom panel keeps its
 * split parent, so Theia's resizing and layout restore work as before.
 */
@injectable()
export class OwnStudioApplicationShell extends ApplicationShell {

    @inject(TimelineWidget) protected readonly timeline: TimelineWidget;

    protected override createLayout(): Layout {
        const bottomSplitLayout = this.createSplitLayout([this.mainPanel, this.bottomPanel], [1, 0], { orientation: 'vertical', spacing: 0 });
        const panelForBottomArea = new TheiaSplitPanel({ layout: bottomSplitLayout });
        panelForBottomArea.id = 'theia-bottom-split-panel';
        const centreColumn = new BoxPanel({ layout: this.createBoxLayout([panelForBottomArea, this.timelineWidget()], [1, 0], { direction: 'top-to-bottom', spacing: 0 }) });
        centreColumn.id = 'ownstudio-centre-column';
        const leftRightSplitLayout = this.createSplitLayout([this.leftPanelHandler.container, centreColumn, this.rightPanelHandler.container], [0, 1, 0], { orientation: 'horizontal', spacing: 0 });
        const panelForSideAreas = new TheiaSplitPanel({ layout: leftRightSplitLayout });
        panelForSideAreas.id = 'theia-left-right-split-panel';
        return this.createBoxLayout([this.topPanel, panelForSideAreas, this.statusBar], [0, 1, 0], { direction: 'top-to-bottom', spacing: 0 });
    }

    /** createLayout() runs from the shell's @postConstruct, after property injection. */
    protected timelineWidget(): Widget {
        return this.timeline;
    }
}

export { TIMELINE_WIDGET_ID };
