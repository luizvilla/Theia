// SPDX-License-Identifier: LGPL-2.1-only
// #20 (F14 finding 3): the window title names what the window shows. Theia's updater only
// follows the main panel's current tab, and a workbench switch detaches the old centre view
// without changing it, so the title kept "Lab" in Code. The workbench switch now says what
// the centre shows; an empty centre (Code with no editor open) is named after its workbench.
import { injectable } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser/widgets';
import { WindowTitleUpdater } from '@theia/core/lib/browser/window/window-title-updater';

@injectable()
export class OwnStudioWindowTitleUpdater extends WindowTitleUpdater {
    protected workbench: string | undefined;

    /** After a workbench switch: the centre's current widget (if still in the window) or the workbench's name. */
    showWorkbench(label: string, centre: Widget | undefined): void {
        this.workbench = label;
        this.handleWidgetChange(centre?.isAttached ? centre : undefined);
    }

    protected override updateTitleWidget(widget?: Widget): void {
        if (widget?.isAttached || !this.workbench) {
            super.updateTitleWidget(widget);
            return;
        }
        const name = this.workbench;
        this.windowTitleService.update({
            activeEditorLong: name, activeEditorMedium: name, activeEditorShort: name,
            activeFolderLong: undefined, activeFolderMedium: undefined, activeFolderShort: undefined, dirty: undefined,
        });
    }
}
