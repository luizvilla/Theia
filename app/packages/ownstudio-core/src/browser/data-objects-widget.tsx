// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { DataObject, parseDataObjects, parseInput } from '../common/data-objects';
import { LiveValues, formatValue } from './live-values';
import { MissionService } from './mission-service';

export const DATA_OBJECTS_WIDGET_ID = 'ownstudio.dataObjects';

/** The data object table: data_objects.yaml with live values from the board. */
@injectable()
export class DataObjectsWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(FileService) protected readonly files: FileService;
    @inject(LiveValues) protected readonly live: LiveValues;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected objects: DataObject[] = [];
    protected problem: string | undefined;
    protected rowProblem = new Map<string, string>();
    protected subscription: Disposable | undefined;
    protected readonly toDisposeOnDetach = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = DATA_OBJECTS_WIDGET_ID;
        this.title.label = 'Data objects';
        this.title.caption = 'Data objects exchanged with the board over ThingSet';
        this.title.iconClass = codicon('symbol-field');
        this.title.closable = true;
        this.addClass('ownstudio-workbench');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.load());
        this.missions.onDidChangeFiles(uris => uris.some(u => u.path.base === 'data_objects.yaml') && this.load());
        this.load();
    }

    protected async load(): Promise<void> {
        const uri = this.missions.resolve('data_objects.yaml');
        try {
            this.objects = uri ? parseDataObjects((await this.files.read(uri)).value) : [];
            this.problem = uri ? undefined : 'Open a mission first.';
        } catch (error) {
            this.objects = [];
            this.problem = error instanceof Error ? error.message : String(error);
        }
        this.resubscribe();
        this.update();
    }

    protected resubscribe(): void {
        this.subscription?.dispose();
        this.subscription = this.isAttached ? this.live.subscribe(this.objects.map(o => o.path)) : undefined;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.toDisposeOnDetach.push(this.live.onDidChange(() => this.update()));
        this.resubscribe();
    }

    protected override onBeforeDetach(msg: Message): void {
        this.toDisposeOnDetach.dispose();
        this.subscription?.dispose();
        this.subscription = undefined;
        super.onBeforeDetach(msg);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async set(o: DataObject, text: string): Promise<void> {
        try {
            await this.live.write(o.path, parseInput(o.type, text));
            this.rowProblem.delete(o.path);
        } catch (error) {
            this.rowProblem.set(o.path, error instanceof Error ? error.message : String(error));
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const file = this.missions.resolve('data_objects.yaml');
        return <div className='ownstudio-workbench-body ownstudio-data-objects-body'>
            <h1 className='ownstudio-title'>Data objects</h1>
            <p className='ownstudio-workbench-purpose'>Every value the firmware exchanges with the computer over ThingSet, declared in data_objects.yaml.
                {' '}{file && <a href='#' onClick={e => { e.preventDefault(); open(this.opener, file); }}>Edit data_objects.yaml</a>}</p>
            {!this.live.live && <p className='ownstudio-panel-offline'><span className={codicon('debug-disconnect')} /> No board linked: values are not live.</p>}
            {this.problem && <p className='ownstudio-problem'>{this.problem}</p>}
            <table className='ownstudio-table ownstudio-data-table'>
                <thead><tr><th>Path</th><th>Type</th><th>Unit</th><th>Value</th><th>Set</th><th>Description</th></tr></thead>
                <tbody>{this.objects.map(o => <tr key={o.path}>
                    <td><code>{o.path}</code></td>
                    <td>{o.type}</td>
                    <td>{o.unit ?? ''}</td>
                    <td className='ownstudio-live-value'>{this.live.live ? formatValue(this.live.values.get(o.path), o.type) : '—'}</td>
                    <td>{o.writable
                        ? <><input className='theia-input ownstudio-number' aria-label={`Set ${o.path}`} disabled={!this.live.live}
                            onKeyDown={e => { if (e.key === 'Enter') { this.set(o, e.currentTarget.value); } }} placeholder='Enter' />
                            {this.rowProblem.get(o.path) && <div className='ownstudio-problem'>{this.rowProblem.get(o.path)}</div>}</>
                        : <span className='ownstudio-muted'>read-only</span>}</td>
                    <td className='ownstudio-muted'>{o.description}</td>
                </tr>)}</tbody>
            </table>
        </div>;
    }
}
