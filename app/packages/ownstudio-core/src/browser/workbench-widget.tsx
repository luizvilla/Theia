// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { Workbench, widgetId } from './workbenches';

/** Placeholder main view of a workbench, until its real content lands (plan steps 2 to 4). */
@injectable()
export class WorkbenchWidget extends ReactWidget {

    protected workbench: Workbench;

    configure(workbench: Workbench): this {
        this.workbench = workbench;
        this.id = widgetId(workbench);
        this.title.label = workbench.label;
        this.title.caption = workbench.purpose;
        this.title.iconClass = codicon(workbench.icon);
        this.title.closable = false;
        this.addClass('ownstudio-workbench');
        this.node.tabIndex = 0;
        this.update();
        return this;
    }

    /** Theia's activateWidget() waits until the widget holds focus: take it. */
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        const w = this.workbench;
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{w.label}</h1>
            <p className='ownstudio-workbench-purpose'>{w.purpose}</p>
            <h2 className='ownstudio-emphasis'>Coming next</h2>
            <ul>{w.comingNext.map(item => <li key={item}>{item}</li>)}</ul>
        </div>;
    }
}
