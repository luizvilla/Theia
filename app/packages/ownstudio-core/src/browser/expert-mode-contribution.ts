// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { ApplicationShell, FrontendApplication, FrontendApplicationContribution, StorageService } from '@theia/core/lib/browser';

export const TOGGLE_EXPERT_MODE: Command = {
    id: 'ownstudio.toggleExpertMode',
    category: 'OwnStudio',
    label: 'Toggle Expert Mode',
};

const STORAGE_KEY = 'ownstudio.expertMode';

/**
 * Expert mode shows the full IDE (file tree, side panels, bottom panel).
 * Out of expert mode, those panels are collapsed so that Home and the
 * workbenches are what a first-time user sees. Stub for step T2: the
 * workbench bar (T3) will use the same flag.
 */
@injectable()
export class ExpertModeContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(StorageService) protected readonly storage: StorageService;

    protected expert = false;

    get isExpert(): boolean { return this.expert; }

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        this.expert = await this.storage.getData<boolean>(STORAGE_KEY, false);
        this.apply();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TOGGLE_EXPERT_MODE, {
            execute: async () => {
                this.expert = !this.expert;
                await this.storage.setData(STORAGE_KEY, this.expert);
                this.apply();
            },
            isToggled: () => this.expert,
        });
    }

    protected apply(): void {
        for (const area of ['left', 'right', 'bottom'] as const) {
            if (this.expert) {
                this.shell.expandPanel(area);
            } else {
                this.shell.collapsePanel(area);
            }
        }
    }
}
