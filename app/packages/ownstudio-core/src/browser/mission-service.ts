// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Mission, parseMission } from './mission';
import { BoardPack, parseBoardPack } from '../common/board-pack';
import { BoardService } from '../common/board-protocol';
import { Requirement, parseRequirements } from '../common/verification';
import { TestStates } from '../common/test-states';

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
    /** Where the validation stands (tests/catalogue.yaml, records/, tests/findings.yaml). */
    tests: TestStates | undefined;
    testsProblem: string | undefined;

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
                } else if (inside.some(uri => this.root!.resolve(RECORDS_FOLDER).isEqualOrParent(uri)
                    || this.root!.resolve('tests').isEqualOrParent(uri) || (requirements && requirements.isEqual(uri)))) {
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
        this.tests = undefined;
        this.testsProblem = undefined;
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
        // The test states come from the Python bridge, which may be starting or busy with
        // the board: don't hold the mission back for them.
        this.loadTests(root).then(() => this.onDidChangeEmitter.fire());
    }

    /** Ask ownstudio_lab.testing (through the bridge). The bridge may still be starting: try again once. */
    protected async loadTests(root: URI, retry = true): Promise<void> {
        try {
            this.tests = await this.boards.tests(root.path.fsPath());
            this.testsProblem = undefined;
        } catch (error) {
            this.tests = undefined;
            this.testsProblem = error instanceof Error ? error.message : String(error);
            if (retry) {
                setTimeout(() => this.root === root && this.loadTests(root, false).then(() => this.onDidChangeEmitter.fire()), 3000);
            }
        }
    }

    /** Recompute the test states now (after a procedure ran, or from the control center). */
    async refreshTests(): Promise<void> {
        if (this.root) {
            await this.loadTests(this.root, false);
            this.onDidChangeEmitter.fire();
        }
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
