// SPDX-License-Identifier: LGPL-2.1-only
// Plan U16: which design sheets the open setup has, and which one is shown.
// The Design panel lists them; the Design workbench's centre draws the selected one.
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { SetupService } from '../common/setup-protocol.js';
import { DesignSheetEntry } from '../common/design-sheet.js';

@injectable()
export class DesignModel {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    folder: string | undefined;
    sheets: DesignSheetEntry[] = [];
    selected: string | undefined;
    problem: string | undefined;
    protected loading: Promise<void> | undefined;

    @postConstruct()
    protected init(): void {
        this.workspace.onWorkspaceChanged(() => { this.loading = undefined; void this.ready(); });
    }

    /** Loads the sheets once per folder; a setup made before U16 gets its board's sheets here. */
    ready(): Promise<void> {
        return this.loading ??= this.load();
    }

    protected async load(): Promise<void> {
        const folder = (await this.workspace.roots)[0]?.resource.path.fsPath();
        this.folder = undefined;
        this.sheets = [];
        this.problem = undefined;
        if (folder && await this.setups.isSetup(folder)) {
            this.folder = folder;
            try {
                const info = await this.setups.designSheets(folder);
                this.sheets = info.sheets;
                if (!this.sheets.some(s => s.id === this.selected)) {
                    this.selected = this.sheets[0]?.id;
                }
            } catch (error) {
                this.problem = error instanceof Error ? error.message : String(error);
            }
        }
        this.onDidChangeEmitter.fire();
    }

    select(id: string): void {
        if (this.selected !== id && this.sheets.some(s => s.id === id)) {
            this.selected = id;
            this.onDidChangeEmitter.fire();
        }
    }
}
