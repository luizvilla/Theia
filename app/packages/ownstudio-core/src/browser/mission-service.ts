// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Mission, parseMission } from './mission';
import { BoardPack, parseBoardPack } from '../common/board-pack';
import { BoardService } from '../common/board-protocol';
import { Requirement, TestRecord, parseRecord, parseRequirements } from '../common/verification';

export const RECORDS_FOLDER = 'records';

/**
 * The mission open in the window: the workspace root's mission.yaml.
 * Reloads when the workspace or any file of the mission changes, and tells
 * listeners which files changed.
 */
@injectable()
export class MissionService {

    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(FileService) protected readonly files: FileService;
    @inject(BoardService) protected readonly boards: BoardService;

    root: URI | undefined;
    mission: Mission | undefined;
    problem = 'Opening…';
    /** The board pack the mission names, and where it was read from. */
    board: BoardPack | undefined;
    boardSource: string | undefined;
    boardProblem: string | undefined;
    requirements: Requirement[] = [];
    requirementsProblem: string | undefined;
    /** Test records found in records/, newest first. */
    records: TestRecord[] = [];

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** mission.yaml or the workspace changed. */
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected readonly onDidChangeFilesEmitter = new Emitter<URI[]>();
    /** Files inside the mission folder changed (any file). */
    readonly onDidChangeFiles = this.onDidChangeFilesEmitter.event;

    @postConstruct()
    protected init(): void {
        this.workspace.onWorkspaceChanged(() => this.load());
        this.files.onDidFilesChange(event => {
            if (!this.root) {
                return;
            }
            const inside = event.changes.map(c => c.resource).filter(uri => this.root!.isEqualOrParent(uri));
            if (inside.length) {
                this.onDidChangeFilesEmitter.fire(inside);
                const requirements = this.mission?.requirements ? this.root.resolve(this.mission.requirements) : undefined;
                if (event.contains(this.root.resolve('mission.yaml'))) {
                    this.load();
                } else if (inside.some(uri => this.root!.resolve(RECORDS_FOLDER).isEqualOrParent(uri) || (requirements && requirements.isEqual(uri)))) {
                    this.loadVerification().then(() => this.onDidChangeEmitter.fire());
                }
            }
        });
        this.load();
    }

    resolve(path: string): URI | undefined {
        return this.root?.resolve(path);
    }

    protected async load(): Promise<void> {
        const roots = await this.workspace.roots;
        this.root = roots[0]?.resource;
        this.mission = undefined;
        this.board = undefined;
        this.boardSource = undefined;
        this.boardProblem = undefined;
        this.requirements = [];
        this.requirementsProblem = undefined;
        this.records = [];
        if (!this.root) {
            this.problem = 'Open a mission folder (File › Open Folder) to see its converter here.';
        } else {
            const uri = this.root.resolve('mission.yaml');
            try {
                this.mission = parseMission((await this.files.read(uri)).value);
                this.problem = '';
                await this.loadBoard(this.mission.board.pack);
                await this.loadVerification();
            } catch (error) {
                this.problem = (await this.files.exists(uri))
                    ? `mission.yaml could not be read: ${error instanceof Error ? error.message : error}`
                    : 'This folder has no mission.yaml. Open a mission folder to see its converter here.';
            }
        }
        this.onDidChangeEmitter.fire();
    }

    protected async loadVerification(): Promise<void> {
        const root = this.root;
        if (!root || !this.mission) {
            return;
        }
        this.requirementsProblem = undefined;
        if (this.mission.requirements) {
            try {
                this.requirements = parseRequirements((await this.files.read(root.resolve(this.mission.requirements))).value);
            } catch (error) {
                this.requirements = [];
                this.requirementsProblem = error instanceof Error ? error.message : String(error);
            }
        }
        const records: TestRecord[] = [];
        try {
            const folder = await this.files.resolve(root.resolve(RECORDS_FOLDER));
            for (const child of folder.children ?? []) {
                const file = child.resource.resolve('record.json');
                if (child.isDirectory && await this.files.exists(file)) {
                    const record = parseRecord((await this.files.read(file)).value, `${RECORDS_FOLDER}/${child.name}`);
                    if (record) {
                        records.push(record);
                    }
                }
            }
        } catch {
            // no records/ yet
        }
        this.records = records.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }

    protected async loadBoard(name: string): Promise<void> {
        try {
            const found = await this.boards.boardPack(name);
            if (!found) {
                this.boardProblem = `No board pack named '${name}' is installed.`;
                return;
            }
            this.board = parseBoardPack(found.text);
            this.boardSource = found.path;
        } catch (error) {
            this.boardProblem = error instanceof Error ? error.message : String(error);
        }
    }
}
