// SPDX-License-Identifier: LGPL-2.1-only
// The Start page (SPEC §5, storyboard frame 1, plan U6): shown when no setup is
// open. Choose a board to start a setup, open a recent one, or look at the
// board's examples. Replaces 1.0's Home.
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { QuickInputService } from '@theia/core/lib/browser';
import { CommandService, MessageService } from '@theia/core/lib/common';
import { LOAD_EXAMPLE } from './example-contribution.js';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { SetupService, StartBoard, StartInfo } from '../common/setup-protocol.js';
import { BoardModel } from './board-model.js';

export const START_WIDGET_ID = 'ownstudio.start';

@injectable()
export class StartWidget extends ReactWidget {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(QuickInputService) protected readonly input: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(CommandService) protected readonly commands: CommandService;

    protected info: StartInfo | undefined;
    protected error = '';
    protected chosen = 'twist';
    protected busy = false;

    @postConstruct()
    protected init(): void {
        this.id = START_WIDGET_ID;
        this.title.label = 'Start';
        this.title.caption = 'Choose a board to start a setup, or open one';
        this.title.iconClass = 'ownstudio-icon ownstudio-icon-parts';
        this.title.closable = true;
        this.addClass('ownstudio-start');
        this.node.tabIndex = 0;
        this.toDispose.push(this.board.onDidChange(() => this.update()));
        this.refresh();
    }

    async refresh(): Promise<void> {
        try {
            this.info = await this.setups.startInfo();
            this.error = '';
        } catch (e) {
            this.error = String((e as Error).message ?? e);
        }
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async newSetup(board: StartBoard): Promise<void> {
        const name = await this.input.input({ prompt: `Name of the new setup on the ${board.label}`, value: `${board.board}-setup` });
        if (!name) {
            return;
        }
        this.busy = true;
        this.update();
        const progress = await this.messages.showProgress({ text: `Creating "${name}" from OwnTech Core…` });
        try {
            const folder = await this.setups.createSetup(board.board, name);
            progress.cancel();
            await this.workspace.open(new URI(`file://${folder}`), { preserveWindow: true });
        } catch (e) {
            progress.cancel();
            this.messages.error(`The setup could not be created: ${(e as Error).message ?? e}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        const info = this.info;
        const connected = this.board.boards[0];
        const boards = info?.boards ?? [];
        const chosen = boards.find(b => b.board === this.chosen) ?? boards[0];
        const examples = (info?.examples ?? []).filter(e => e.board === chosen?.board);
        return <div className='ownstudio-start-body'>
            <h1 className='ownstudio-title'>Start</h1>
            <p className='ownstudio-muted'>Choose a board to start a setup, or open one.</p>
            {this.error && <p className='ownstudio-start-error'>{this.error}</p>}
            <div className='ownstudio-start-boards'>
                {boards.map(b => {
                    const hot = b.defined && b.controller === 'spin' && !!connected;
                    return <div key={b.board} className={'ownstudio-start-card' + (hot ? ' ownstudio-hot' : '') + (b.board === chosen?.board ? ' ownstudio-chosen' : '')}
                        data-board={b.board} onClick={() => { this.chosen = b.board; this.update(); }}>
                        <div className='ownstudio-start-card-title'>{b.label}</div>
                        <div className='ownstudio-muted'>{b.summary}</div>
                        {hot && <div className='ownstudio-start-connected'>● connected · {connected.serial_number}</div>}
                        {b.defined
                            ? <button className='theia-button' disabled={this.busy}
                                onClick={e => { e.stopPropagation(); this.newSetup(b); }}>{hot ? `New setup on the ${b.label.split(' ')[0]}` : 'New setup'}</button>
                            : <button className='theia-button secondary' disabled title='Its board definition comes later'>Later</button>}
                    </div>;
                })}
                <div className='ownstudio-start-card ownstudio-dashed'>
                    <div className='ownstudio-start-card-title'>Custom board</div>
                    <div className='ownstudio-muted'>your overlay + a board description</div>
                    <button className='theia-button secondary' disabled title='Custom boards come in slice 2'>Add… (slice 2)</button>
                </div>
            </div>
            <div className='ownstudio-start-columns'>
                <div className='ownstudio-start-card'>
                    <div className='ownstudio-panel-head'>Recent setups</div>
                    {(info?.recent ?? []).length === 0 && <p className='ownstudio-muted'>None yet: start one from a board above.</p>}
                    {(info?.recent ?? []).map(s => <div key={s.path} className='ownstudio-part' data-setup={s.path}
                        onClick={() => this.workspace.open(new URI(`file://${s.path}`), { preserveWindow: true })}>
                        {s.name}<small>{s.board} · {new Date(s.modified * 1000).toLocaleDateString()}</small>
                    </div>)}
                </div>
                <div className='ownstudio-start-card'>
                    <div className='ownstudio-panel-head'>{chosen?.label ?? ''} examples ({examples.length} in OwnTech examples)</div>
                    {!info?.examplesFound && <p className='ownstudio-muted'>OwnTech's examples are not on this computer yet ({info?.home}/.cache/examples).</p>}
                    <div className='ownstudio-start-examples'>
                        {examples.map(e => <div key={e.path} className='ownstudio-part' data-example={e.path} title={e.path}
                            onClick={() => this.commands.executeCommand(LOAD_EXAMPLE.id, e.path)}>
                            {e.title}<small>{e.group}{e.extras ? ' · extras' : ''}</small>
                        </div>)}
                    </div>
                </div>
            </div>
            <div className='ownstudio-start-card'>
                <div className='ownstudio-panel-head'>Tutorials</div>
                <div className='ownstudio-part ownstudio-later'>Make the Twist follow its reference and hold 12 V<small>after slice 1</small></div>
            </div>
        </div>;
    }
}
