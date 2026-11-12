// SPDX-License-Identifier: LGPL-2.1-only
// U14: PulsimGui edits the setup-owned plant in its own window. Its Run button
// uses ownstudio_lab's normal simulator Harness; a save is observed here and
// the four stable named component values are reflected on the canvas.
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, Disposable, MessageService } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SetupService } from '../common/setup-protocol';
import { CanvasWidget } from './canvas-widget';

export const OPEN_PULSIMGUI_COMMAND = {
    id: 'ownstudio.setup.openPulsimGui', label: 'Open in PulsimGui', category: 'Setup',
};
const SAVE_DEBOUNCE_MS = 300;

export function isPulsimSave(event: FileChangesEvent, root: URI): boolean {
    return event.changes.some(change => root.isEqualOrParent(change.resource)
        && change.resource.path.base.toLowerCase().endsWith('.pulsim'));
}

@injectable()
export class PulsimGuiContribution implements CommandContribution, FrontendApplicationContribution {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(FileService) protected readonly files: FileService;
    @inject(CanvasWidget) protected readonly canvas: CanvasWidget;
    @inject(MessageService) protected readonly messages: MessageService;

    protected watch: Disposable | undefined;
    protected timer: ReturnType<typeof setTimeout> | undefined;

    onStart(): void {
        this.watch = this.files.onDidFilesChange(event => { void this.changed(event); });
    }

    onStop(): void {
        this.watch?.dispose();
        clearTimeout(this.timer);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OPEN_PULSIMGUI_COMMAND, { execute: () => this.open() });
    }

    protected async root(): Promise<URI | undefined> {
        return (await this.workspace.roots)[0]?.resource;
    }

    protected async open(): Promise<void> {
        const root = await this.root();
        if (!root || !await this.setups.isSetup(root.path.fsPath())) {
            this.messages.warn('Open an OwnStudio setup before opening PulsimGui.');
            return;
        }
        try {
            await this.setups.openPulsimGui(root.path.fsPath());
            this.messages.info('Opened the setup plant in PulsimGui. Its Run action uses the OwnStudio runner.');
        } catch (error) {
            this.messages.error(`PulsimGui could not open: ${error instanceof Error ? error.message : error}`);
        }
    }

    protected async changed(event: FileChangesEvent): Promise<void> {
        const root = await this.root();
        if (!root || !isPulsimSave(event, root)) {
            return;
        }
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.sync(root); }, SAVE_DEBOUNCE_MS);
    }

    protected async sync(root: URI): Promise<void> {
        try {
            const result = await this.setups.syncPlantValues(root.path.fsPath());
            this.canvas.replaceFromPlant(result.canvas);
            const changed = Object.keys(result.changed);
            if (changed.length) {
                this.messages.info(`PulsimGui saved ${changed.join(', ')}; the setup canvas is in sync.`);
            }
        } catch (error) {
            this.messages.error(`The PulsimGui save could not be synced: ${error instanceof Error ? error.message : error}`);
        }
    }
}
