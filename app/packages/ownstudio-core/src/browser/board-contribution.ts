// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { ConfirmDialog, FrontendApplicationContribution, QuickInputService, QuickPickItem, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { boardName } from '../common/board-protocol.js';
import { BoardClientImpl, BoardModel } from './board-model.js';
import { MissionService } from './mission-service.js';

/** F8 (Q179): Board › Select board…, the Spin this setup works with when several are plugged in. */
export const SELECT_BOARD_COMMAND = { id: 'ownstudio.board.select', category: 'OwnStudio', label: 'Select board…' };
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
    @inject(QuickInputService) protected readonly input: QuickInputService;

    onStart(): void {
        this.board.onDidChange(() => this.render());
        this.render();
        this.board.start();
    }

    onStop(): void {
        this.statusBar.removeElement('ownstudio.board');
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SELECT_BOARD_COMMAND, { execute: () => this.select() });
        registry.registerCommand(FLASH_COMMAND, {
            execute: () => this.flash(),
            isEnabled: () => !this.board.busy && !!this.board.identity?.prebuilt,
        });
    }

    /** Lists the plugged-in boards by serial number; the choice is remembered by the setup. */
    async select(): Promise<string | undefined> {
        const boards = this.board.boards;
        if (!boards.length) {
            this.messages.warn('No board is connected. Plug a Spin into USB.');
            return undefined;
        }
        const items: (QuickPickItem & { serial: string })[] = boards.map(b => ({
            serial: b.serial_number,
            label: `${boardName(b.product)} · ${b.serial_number}`,
            description: b.serial_number === this.board.target ? (this.board.link?.serial_number === b.serial_number ? 'linked' : 'chosen') : undefined,
            detail: b.in_bootloader ? 'waiting in its bootloader' : Object.values(b.ports)[0],
        }));
        const chosen = await this.input.showQuickPick(items, {
            placeholder: `Which board does this setup work with? (${boards.length} connected; the setup remembers it)`,
        });
        if (!chosen) {
            return undefined;
        }
        await this.board.choose(chosen.serial);
        this.messages.info(`This setup now works with ${chosen.label}.`);
        return chosen.serial;
    }

    protected async flash(): Promise<void> {
        const prebuilt = this.board.identity?.prebuilt;
        const boards = this.board.boards;
        if (!prebuilt) {
            this.messages.warn('This mission has no pre-built firmware (bin/manifest.json).');
            return;
        }
        if (!boards.length) {
            this.messages.warn('No board is connected.');
            return;
        }
        const serial = this.board.target ?? await this.select();
        const target = boards.find(b => b.serial_number === serial);
        if (!target) {
            return;
        }
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
            // F8: with several boards, the status bar says which one this setup is linked to.
            const name = boardName(link.product) + (boards.length > 1 ? ` ${link.serial_number}` : '');
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
        } else if (this.board.needsChoice) {
            text = `$(plug) ${boards.length} boards · choose one`;
            tooltip = `Several boards are connected (${boards.map(b => b.serial_number).join(', ')}). Click to choose the one this setup works with.`;
            command = SELECT_BOARD_COMMAND.id;
            className += ' ownstudio-board-warning';
        } else if (boards.length > 1) {
            const chosen = boards.find(b => b.serial_number === this.board.target)!;
            text = `$(plug) ${boardName(chosen.product)} ${chosen.serial_number} · no mission firmware`;
            tooltip = 'The chosen board does not answer ThingSet yet. Click to choose another board.';
            command = SELECT_BOARD_COMMAND.id;
            className += ' ownstudio-board-warning';
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
