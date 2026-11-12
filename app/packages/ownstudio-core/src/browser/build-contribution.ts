// SPDX-License-Identifier: LGPL-2.1-only
// One owner for the U10 build actions used by the Code toolbar, status bar and
// Board menu. Process output goes to Theia's existing Build output tab.
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, Emitter, MessageService } from '@theia/core/lib/common';
import { codicon, Widget, WidgetManager } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OutputChannel, OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { BuildClient, BuildEvent, BuildResult, BuildService } from '../common/build-protocol.js';
import { SetupService } from '../common/setup-protocol.js';
import { BOTTOM_SLOTS } from '../common/window-layout.js';
import { CanvasWidget } from './canvas-widget.js';
import { BoardModel } from './board-model.js';

export const BUILD_COMMAND = { id: 'ownstudio.setup.build', category: 'OwnStudio', label: 'Build' };
export const UPLOAD_COMMAND = { id: 'ownstudio.setup.upload', category: 'OwnStudio', label: 'Upload' };
export const BUILD_UPLOAD_COMMAND = { id: 'ownstudio.setup.buildUpload', category: 'OwnStudio', label: 'Build and upload' };
export const CLEAN_COMMAND = { id: 'ownstudio.setup.clean', category: 'OwnStudio', label: 'Clean' };
export const SERIAL_COMMAND = { id: 'ownstudio.setup.serial', category: 'OwnStudio', label: 'Serial' };

@injectable()
export class BuildClientImpl implements BuildClient {
    protected readonly eventEmitter = new Emitter<BuildEvent>();
    readonly onEvent = this.eventEmitter.event;
    onBuildEvent(event: BuildEvent): void { this.eventEmitter.fire(event); }
}

@injectable()
export class BuildContribution implements CommandContribution, TabBarToolbarContribution {
    @inject(BuildService) protected readonly builds: BuildService;
    @inject(BuildClientImpl) protected readonly client: BuildClientImpl;
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(OutputChannelManager) protected readonly outputs: OutputChannelManager;
    @inject(TerminalService) protected readonly terminals: TerminalService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(BoardModel) protected readonly board: BoardModel;

    protected busy = false;
    protected progress: { report(update: { message?: string; work?: { done: number; total: number } }): void; cancel(): void } | undefined;
    protected readonly changed = new Emitter<void>();

    @postConstruct()
    protected init(): void { this.client.onEvent(event => this.receive(event)); }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(BUILD_COMMAND, {
            execute: () => this.perform('Building the setup', true, async folder => { await this.build(folder); }),
            isEnabled: () => !this.busy,
        });
        registry.registerCommand(UPLOAD_COMMAND, {
            execute: () => this.perform('Uploading to the board', true, async folder => { await this.upload(folder); }),
            isEnabled: () => !this.busy,
        });
        registry.registerCommand(BUILD_UPLOAD_COMMAND, {
            execute: () => this.perform('Building and uploading', true, async folder => { await this.build(folder); await this.upload(folder); }),
            isEnabled: () => !this.busy,
        });
        registry.registerCommand(CLEAN_COMMAND, {
            execute: () => this.perform('Cleaning the build', true, async folder => {
                await this.builds.clean(folder);
                await this.board.refreshIdentity();
                this.messages.info('Build files cleaned.');
            }),
            isEnabled: () => !this.busy,
        });
        registry.registerCommand(SERIAL_COMMAND, {
            execute: () => this.openSerial(), isEnabled: () => !this.busy,
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        const items = [
            [BUILD_COMMAND, 10],
            [UPLOAD_COMMAND, 11],
            [BUILD_UPLOAD_COMMAND, 12],
            [CLEAN_COMMAND, 13],
            [SERIAL_COMMAND, 14],
        ] as const;
        for (const [command, priority] of items) {
            registry.registerItem({
                id: `toolbar.${command.id}`, command: command.id, text: command.label,
                tooltip: command.label, group: 'navigation', priority, onDidChange: this.changed.event,
                isVisible: (widget?: Widget) => !!widget?.id.startsWith('code-editor-opener:'),
            });
        }
    }

    protected get output(): OutputChannel { return this.outputs.getChannel('Build output'); }

    protected receive(event: BuildEvent): void {
        this.output.appendLine(event.text);
        const progress = event.current !== undefined && event.total
            ? `${event.current.toLocaleString()} / ${event.total.toLocaleString()} bytes`
            : event.text;
        this.progress?.report({ message: progress,
            work: event.current !== undefined && event.total ? { done: event.current, total: event.total } : undefined });
    }

    protected async perform(label: string, clear: boolean, action: (folder: string) => Promise<void>): Promise<void> {
        if (this.busy) { return; }
        const folder = await this.setupFolder();
        if (!folder) { return; }
        this.busy = true;
        this.changed.fire();
        if (clear) { this.output.clear(); }
        this.output.show({ preserveFocus: false });
        this.progress = await this.messages.showProgress({ text: label });
        try {
            await action(folder);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.output.appendLine(`Error: ${message}`);
            this.messages.error(`${label} failed: ${message}`);
        } finally {
            this.progress?.cancel();
            this.progress = undefined;
            this.busy = false;
            this.changed.fire();
        }
    }

    protected async build(folder: string): Promise<BuildResult> {
        const result = await this.builds.build(folder);
        this.canvas()?.setFirmware(`${result.identity.source_hash} ✓`);
        await this.setups.commitEvent(folder, 'build', `Build ${result.identity.source_hash} ✓`);
        await this.board.refreshIdentity();
        this.messages.info(`Build ${result.identity.source_hash} finished in ${Math.round(result.duration_ms / 1000)} s.`);
        return result;
    }

    protected async upload(folder: string): Promise<BuildResult> {
        const canvas = this.canvas();
        canvas?.setFirmware('flashing…');
        try {
            const result = await this.builds.upload(folder);
            canvas?.setFirmware(`${result.identity.source_hash} ✓`);
            await this.setups.commitEvent(folder, 'flash', `Flash ${result.identity.source_hash} ✓`);
            this.messages.info(`Uploaded ${result.bytes.toLocaleString()} bytes to the board.`);
            return result;
        } catch (error) {
            canvas?.setFirmware('upload failed');
            throw error;
        }
    }

    protected async openSerial(): Promise<void> {
        const folder = await this.setupFolder();
        if (!folder) { return; }
        const command = await this.builds.serialCommand();
        const terminal = await this.terminals.newTerminal({
            title: 'Serial monitor', iconClass: codicon('plug'), cwd: folder,
            shellPath: command.command, shellArgs: command.args, destroyTermOnClose: true,
        });
        await terminal.start();
        await this.terminals.open(terminal);
    }

    protected async setupFolder(): Promise<string | undefined> {
        const roots = await this.workspace.roots;
        const folder = roots[0]?.resource.path.fsPath();
        if (!folder || !await this.setups.isSetup(folder).catch(() => false)) {
            this.messages.warn('Open an OwnStudio setup first.');
            return undefined;
        }
        return folder;
    }

    protected canvas(): CanvasWidget | undefined {
        return this.widgets.tryGetWidget<CanvasWidget>(BOTTOM_SLOTS[0].widgetId);
    }
}
