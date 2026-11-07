// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { ConfirmDialog, FrontendApplicationContribution, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { boardName } from '../common/board-protocol';
import { BoardClientImpl, BoardModel } from './board-model';
import { MissionService } from './mission-service';

export const FLASH_COMMAND = { id: 'ownstudio.board.flash', category: 'OwnStudio', label: "Flash the Mission's Pre-built Firmware" };

export const boardPreferenceSchema: PreferenceSchema = {
    properties: {
        'ownstudio.python': {
            type: 'string',
            default: '',
            description: 'Python executable with the ownstudio_lab package installed. It runs the board link, procedures and tests. ' +
                'Empty: the OWNSTUDIO_PYTHON environment variable, else python3.',
        },
        'ownstudio.mcumgr': {
            type: 'string',
            default: '',
            description: "OwnTech's mcumgr executable, used to flash boards. Empty: the OWNSTUDIO_MCUMGR environment variable, else mcumgr on the PATH.",
        },
    },
};

export const BoardPreferenceContribution: PreferenceContribution = { schema: boardPreferenceSchema };

/** The board entry on the right of the workbench bar, and the flash command. */
@injectable()
export class BoardContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(BoardClientImpl) protected readonly client: BoardClientImpl;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(MessageService) protected readonly messages: MessageService;

    onStart(): void {
        this.board.onDidChange(() => this.render());
        this.render();
        this.board.start();
    }

    onStop(): void {
        this.statusBar.removeElement('ownstudio.board');
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(FLASH_COMMAND, {
            execute: () => this.flash(),
            isEnabled: () => !this.board.busy && !!this.board.identity?.prebuilt,
        });
    }

    protected async flash(): Promise<void> {
        const prebuilt = this.board.identity?.prebuilt;
        const boards = this.board.boards;
        if (!prebuilt) {
            this.messages.warn('This mission has no pre-built firmware (bin/manifest.json).');
            return;
        }
        if (boards.length !== 1) {
            this.messages.warn(boards.length ? 'Several boards are connected: unplug all but one.' : 'No board is connected.');
            return;
        }
        const target = boards[0];
        const title = this.missions.mission?.title ?? 'this mission';
        const ok = await new ConfirmDialog({
            title: 'Flash the board',
            msg: `Replace the firmware of ${boardName(target.product)} (${target.serial_number}) with the pre-built firmware of "${title}" ` +
                `(sources ${prebuilt.build.source_hash})? The converter stays idle after flashing.`,
            ok: 'Flash',
        }).open();
        if (!ok) {
            return;
        }
        const progress = await this.messages.showProgress({ text: 'Flashing the board' });
        const log = this.client.onFlashLogEvent(text => progress.report({ message: text }));
        try {
            const result = await this.board.flash(target.serial_number);
            this.messages.info(`Flashed: ${boardName(result.product)} runs the mission firmware.`);
        } catch (error) {
            this.messages.error(`Flashing failed: ${error instanceof Error ? error.message : error}`);
        } finally {
            log.dispose();
            progress.cancel();
        }
    }

    protected render(): void {
        const { boards, link, problem } = this.board;
        let text: string;
        let tooltip: string;
        let command: string | undefined;
        let className = 'ownstudio-board';
        if (this.board.busy) {
            text = '$(sync~spin) Flashing…';
            tooltip = 'The board is being flashed.';
        } else if (problem && !boards.length) {
            text = '$(warning) Board link unavailable';
            tooltip = `${problem}\n\nCheck the ownstudio.python preference: it must name a Python with ownstudio_lab installed.`;
            className += ' ownstudio-board-warning';
        } else if (!boards.length) {
            text = '$(debug-disconnect) No board';
            tooltip = 'Plug a Twist into USB. It is detected automatically.';
        } else if (link) {
            const name = boardName(link.product);
            const state = this.board.firmware;
            const build = link.build;
            const running = build ? `Runs sources ${build.rSourceHash} (commit ${build.rCommit.slice(0, 7)}${build.rDirty ? ', dirty' : ''}).` : 'Reports no build identity.';
            const sources = this.board.identity?.sources?.source_hash;
            if (state === 'matches') {
                text = `$(plug) ${name} · $(check) firmware matches`;
                tooltip = `${name} on ${link.port}. ${running}\nThe mission's sources are the same.`;
            } else {
                const why = {
                    prebuilt: "It runs the mission's pre-built firmware, but the sources have changed since.",
                    differs: `The mission's sources are ${sources}: the board runs other code.`,
                    unknown: 'The firmware or the mission has no build identity to compare.',
                }[state];
                text = `$(plug) ${name} · $(warning) firmware differs`;
                tooltip = `${name} on ${link.port}. ${running}\n${why}\nClick to flash the mission's pre-built firmware.`;
                command = FLASH_COMMAND.id;
                className += ' ownstudio-board-warning';
            }
        } else if (boards.length > 1) {
            text = `$(plug) ${boards.length} boards`;
            tooltip = 'Several boards are connected. Keep one plugged in to link to it.';
        } else {
            const name = boardName(boards[0].product);
            text = `$(plug) ${name} · no mission firmware`;
            tooltip = boards[0].in_bootloader
                ? 'The board waits in its bootloader. Click to flash the mission firmware.'
                : 'The board does not answer ThingSet. Click to flash the mission firmware.';
            command = FLASH_COMMAND.id;
            className += ' ownstudio-board-warning';
        }
        this.statusBar.setElement('ownstudio.board', {
            text, tooltip, command, className,
            alignment: StatusBarAlignment.RIGHT,
            priority: 999,
        });
    }
}
