// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { OpenerService, QuickInputService, QuickPickItem, open } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { boardName } from '../common/board-protocol.js';
import { SetupService, StartBoard } from '../common/setup-protocol.js';
import { BoardModel } from './board-model.js';
import { LabChecklistModel } from './lab-checklist-model.js';
import { ProcedureModel } from './procedure-model.js';
import { WORKBENCHES, commandId } from './workbenches.js';

/**
 * F16: the menu items that said "(slice 1)" without a command. Each command is what its slice-1
 * step built (U4, U6, U8, U12), reached from the menu. Select board… is in board-contribution.ts.
 */
export const MENU_COMMANDS = {
    newSetup: { id: 'ownstudio.setup.new', category: 'OwnStudio', label: 'New setup…' },
    exportReport: { id: 'ownstudio.record.exportReport', category: 'OwnStudio', label: 'Export a report…' },
    checkSetup: { id: 'ownstudio.setup.check', category: 'OwnStudio', label: 'Check setup' },
    boardsManager: { id: 'ownstudio.board.manager', category: 'OwnStudio', label: 'Boards manager…' },
    boardInfo: { id: 'ownstudio.board.info', category: 'OwnStudio', label: 'Board info' },
    stop: { id: 'ownstudio.procedure.stop', category: 'OwnStudio', label: 'Stop the running procedure' },
    reports: { id: 'ownstudio.record.reports', category: 'OwnStudio', label: 'Reports…' },
    datasheet: { id: 'ownstudio.board.datasheet', category: 'OwnStudio', label: 'Board datasheet' },
};

@injectable()
export class MenuCommandsContribution implements CommandContribution {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(LabChecklistModel) protected readonly checklist: LabChecklistModel;
    @inject(ProcedureModel) protected readonly procedures: ProcedureModel;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(QuickInputService) protected readonly input: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(FileService) protected readonly files: FileService;
    @inject(FileDialogService) protected readonly dialogs: FileDialogService;
    @inject(WindowService) protected readonly windows: WindowService;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;

    protected creating = false;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MENU_COMMANDS.newSetup, { execute: (board?: string) => this.newSetup(board), isEnabled: () => !this.creating });
        registry.registerCommand(MENU_COMMANDS.exportReport, { execute: () => this.exportReport() });
        registry.registerCommand(MENU_COMMANDS.checkSetup, { execute: () => this.checkSetup() });
        registry.registerCommand(MENU_COMMANDS.boardsManager, { execute: () => this.boardsManager() });
        registry.registerCommand(MENU_COMMANDS.boardInfo, { execute: () => this.boardInfo() });
        registry.registerCommand(MENU_COMMANDS.stop, {
            execute: () => this.procedures.stop(),
            isEnabled: () => !!this.procedures.current && !this.procedures.current.done,
        });
        registry.registerCommand(MENU_COMMANDS.reports, { execute: () => this.openReport() });
        registry.registerCommand(MENU_COMMANDS.datasheet, { execute: () => this.datasheet() });
    }

    protected async folder(): Promise<string | undefined> {
        const roots = await this.workspace.roots;
        const folder = roots[0]?.resource.path.fsPath();
        if (!folder || !await this.setups.isSetup(folder).catch(() => false)) {
            this.messages.warn('Open an OwnStudio setup first.');
            return undefined;
        }
        return folder;
    }

    /** File › New setup… and the Start page: which board (when there are several), what name, then OwnTech Core. */
    async newSetup(boardId?: string): Promise<void> {
        const info = await this.setups.startInfo();
        const defined = info.boards.filter(b => b.defined);
        let board: StartBoard | undefined = defined.find(b => b.board === boardId);
        if (!board) {
            board = defined.length === 1 ? defined[0] : (await this.input.showQuickPick(
                defined.map(b => ({ label: b.label, detail: b.summary, board: b })), { placeholder: 'Board of the new setup' }))?.board;
        }
        if (!board) {
            return;
        }
        const name = await this.input.input({ prompt: `Name of the new setup on the ${board.label}`, value: `${board.board}-setup` });
        if (!name) {
            return;
        }
        this.creating = true;
        // F13 (Q186): the stages, each named while it runs.
        const progress = await this.messages.showProgress({ text: `New setup "${name}"` });
        const stage = (n: number, text: string) => progress.report({ message: `${n}/3 ${text}`, work: { done: n - 1, total: 3 } });
        try {
            stage(1, 'Updating OwnTech Core…');
            const core = await this.setups.updateCore();
            stage(2, `Creating the setup from Core${core.updated ? '' : ' (offline: the local copy)'}, with the ${board.label}'s plant, design sheets and agent files…`);
            const folder = await this.setups.createSetup(board.board, name);
            stage(3, 'Opening the setup…');
            await new Promise(resolve => setTimeout(resolve, 300));     // the last stage shows before the window reloads
            progress.cancel();
            await this.workspace.open(new URI(`file://${folder}`), { preserveWindow: true });
        } catch (e) {
            progress.cancel();
            this.messages.error(`The setup could not be created: ${(e as Error).message ?? e}`);
        } finally {
            this.creating = false;
        }
    }

    /** The setup's HTML reports, newest first (ownstudio/reports/). */
    protected async reports(folder: string): Promise<URI[]> {
        const dir = new URI(`file://${folder}/ownstudio/reports`);
        const stat = await this.files.resolve(dir).catch(() => undefined);
        return (stat?.children ?? []).filter(c => !c.isDirectory && c.name.endsWith('.html'))
            .map(c => c.resource).sort((a, b) => b.path.base.localeCompare(a.path.base));
    }

    protected async pickReport(folder: string, placeholder: string): Promise<URI | undefined> {
        const reports = await this.reports(folder);
        if (!reports.length) {
            this.messages.info('This setup has no report yet: run a capture in the Lab, on the board or the simulator.');
            return undefined;
        }
        const items: (QuickPickItem & { uri: URI })[] = reports.map(uri => ({ label: uri.path.name, uri }));
        return (await this.input.showQuickPick(items, { placeholder }))?.uri;
    }

    /** Lab › Reports: open one of the setup's reports. */
    protected async openReport(): Promise<void> {
        const folder = await this.folder();
        const uri = folder && await this.pickReport(folder, 'Report to open (newest first)');
        if (uri) {
            await open(this.opener, uri);
        }
    }

    /** File › Export › Report: a copy of one report, a single portable HTML file, where the user wants it. */
    protected async exportReport(): Promise<void> {
        const folder = await this.folder();
        const report = folder && await this.pickReport(folder, 'Report to export (newest first)');
        if (!report) {
            return;
        }
        const target = await this.dialogs.showSaveDialog({ title: 'Export the report', saveLabel: 'Export', inputValue: report.path.base });
        if (!target) {
            return;
        }
        await this.files.copy(report, target, { overwrite: true });
        this.messages.info(`The report is exported to ${target.path.fsPath()}.`);
    }

    /** Setup › Check setup: the Lab checklist, shown in the Lab, and its verdict in one sentence. */
    protected async checkSetup(): Promise<void> {
        await this.commands.executeCommand(commandId(WORKBENCHES.find(w => w.id === 'lab')!));
        const checks = this.checklist.checks();
        const failed = checks.filter(c => !c.ok);
        if (!failed.length) {
            this.messages.info(`All ${checks.length} Lab checks hold: the setup is ready to run on the board.`);
        } else {
            this.messages.warn(`${checks.length - failed.length} of ${checks.length} Lab checks hold. ${failed[0].label}: ${failed[0].sentence}`);
        }
    }

    /** Board › Boards manager…: the boards OwnStudio knows; one opens its board.yaml. */
    protected async boardsManager(): Promise<void> {
        const info = await this.setups.startInfo();
        const items = info.boards.map(b => ({ label: b.label, description: b.defined ? 'installed' : 'not described yet', detail: b.summary, board: b }));
        const chosen = await this.input.showQuickPick(items, { placeholder: `Boards known to OwnStudio (${items.length}); choose one to open its description` });
        if (!chosen) {
            return;
        }
        const pack = await this.setups.boardDescription(chosen.board.board);
        if (!pack) {
            this.messages.info(`${chosen.label} has no board description (board.yaml) on this computer yet.`);
            return;
        }
        await open(this.opener, URI.fromFilePath(pack.path));
    }

    /** Board › Board info: what the linked board says about itself. */
    protected async boardInfo(): Promise<void> {
        const { link, boards } = this.board;
        if (!link) {
            this.messages.info(boards.length
                ? `${boards.length === 1 ? 'The board' : `${boards.length} boards`} (${boards.map(b => `${boardName(b.product)} ${b.serial_number}`).join(', ')}) ${boards.length === 1 ? 'is' : 'are'} connected but not linked${this.board.needsChoice ? ': choose one with Board › Select board…' : ''}.`
                : 'No board is connected.');
            return;
        }
        const build = link.build;
        const lines = [
            `${boardName(link.product)}, serial number ${link.serial_number}, on ${link.port}.`,
            build ? `Firmware build ${build.rSourceHash} (commit ${build.rCommit.slice(0, 7)}${build.rDirty ? ', with uncommitted changes' : ''}).`
                : 'The firmware reports no build identity.',
            ...Object.entries(link.device ?? {}).map(([key, value]) => `${key.replace(/^r/, '')}: ${value}`),
        ];
        await new ConfirmDialog({ title: 'Board info', msg: lines.join('\n'), ok: 'Close', cancel: '' }).open();
    }

    /** Help › Board datasheet: the link in the board's description (board.yaml `datasheet:`). */
    protected async datasheet(): Promise<void> {
        const roots = await this.workspace.roots;
        const folder = roots[0]?.resource.path.fsPath();
        const setup = folder ? await this.setups.describeSetup(folder).catch(() => undefined) : undefined;
        const name = setup?.board || this.board.link?.product?.split('_')[0]?.toLowerCase() || 'twist';
        const pack = await this.setups.boardDescription(name);
        const url = pack?.text.match(/^datasheet:\s*(\S+)/m)?.[1];
        if (!url) {
            this.messages.info(`The ${name} board description gives no datasheet link yet.`);
            return;
        }
        this.windows.openNewWindow(url, { external: true });
    }
}
