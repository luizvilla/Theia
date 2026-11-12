// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { BoardService } from '../common/board-protocol';
import {
    ProcedureClient, ProcedureEvent, ProcedureInfo, ProcedureService
} from '../common/procedure-protocol';
import { MissionService } from './mission-service';
import { BoardModel } from './board-model';
import { LabChecklistModel } from './lab-checklist-model';

export const RUN_PROCEDURE_COMMAND = { id: 'ownstudio.procedure.run', category: 'OwnStudio', label: 'Run a Procedure…' };
export const RUN_SIMULATOR_COMMAND = { id: 'ownstudio.procedure.runSimulator', category: 'OwnStudio', label: 'Run on the Simulator…' };
export const SHOW_RECORD_COMMAND = { id: 'ownstudio.record.show', category: 'OwnStudio', label: 'Show a Test Record' };

@injectable()
export class ProcedureClientImpl implements ProcedureClient {
    protected readonly emitter = new Emitter<{ runId: number; event: ProcedureEvent }>();
    readonly onEvent = this.emitter.event;
    onProcedureEvent(runId: number, event: ProcedureEvent): void {
        this.emitter.fire({ runId, event });
    }
}

export interface ProcedureRun {
    runId: number;
    info: ProcedureInfo;
    target: 'simulator' | 'board';
    started: Date;
    log: string[];
    ask?: { id: number; kind: 'number' | 'confirm'; question: string };
    records: { path: string; verdict: string }[];
    done?: { status: number; error?: string };
    /** A record filed earlier, shown again (from the control center): no process runs. */
    past?: boolean;
    /** Board record being replayed on the simulator after its result-level action. */
    simulationOf?: string;
}

/**
 * The mission's procedures and the run in progress. A run on the board that
 * switches the converter on asks the user each time (ADR 0010), and the board
 * link is handed over to the procedure's own process while it runs.
 */
@injectable()
export class ProcedureModel {
    @inject(ProcedureService) protected readonly service: ProcedureService;
    @inject(ProcedureClientImpl) protected readonly client: ProcedureClientImpl;
    @inject(BoardService) protected readonly boards: BoardService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(LabChecklistModel) protected readonly checklist: LabChecklistModel;

    procedures: ProcedureInfo[] = [];
    problem: string | undefined;
    current: ProcedureRun | undefined;
    protected restoreBoard: (() => Promise<void>) | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.client.onEvent(({ runId, event }) => this.receive(runId, event));
        this.missions.onDidChange(() => this.refresh());
        this.missions.onDidChangeFiles(uris => uris.some(u => u.path.toString().includes('/tests/procedures/')) && this.refresh());
        this.refresh();
    }

    get running(): boolean {
        return !!this.current && !this.current.done;
    }

    async refresh(): Promise<void> {
        const root = this.missions.root;
        if (!root) {
            this.procedures = [];
        } else {
            try {
                this.procedures = await this.boards.procedures(root.path.fsPath());
                this.problem = undefined;
            } catch (error) {
                this.procedures = [];
                this.problem = error instanceof Error ? error.message : String(error);
            }
        }
        this.onDidChangeEmitter.fire();
    }

    /** Show a record filed earlier, with its waveform and, for a board record, its simulation. */
    showRecord(path: string, target: 'simulator' | 'board', title = 'Test record'): void {
        if (this.running) {
            return;
        }
        const info: ProcedureInfo = { path: '', title, targets: [target], tests: [], level: '', power_on: false, doc: '' };
        this.current = { runId: -2, info, target, started: new Date(), log: [], records: [{ path, verdict: '' }],
            done: { status: 0 }, past: true };
        this.onDidChangeEmitter.fire();
    }

    /** Returns false if the user declined or nothing could start. */
    async run(info: ProcedureInfo, target: 'simulator' | 'board'): Promise<boolean> {
        const root = this.missions.root;
        if (!root || this.running) {
            return false;
        }
        let board: string | undefined;
        let powerToken: string | undefined;
        if (target === 'board') {
            const blocker = this.checklist.blocker(info);
            if (blocker) {
                this.problem = blocker.sentence;
                this.onDidChangeEmitter.fire();
                return false;
            }
            const running = this.board.boards.filter(b => !b.in_bootloader);
            board = this.board.link?.serial_number ?? (running.length === 1 ? running[0].serial_number : undefined);
            if (!board) {
                this.problem = 'Connect exactly one board to run a procedure on it.';
                this.onDidChangeEmitter.fire();
                return false;
            }
            if (info.power_on) {
                const ok = await new ConfirmDialog({
                    title: 'Switch the converter on?',
                    msg: `${this.checklist.confirmationSummary(info)} "${info.title}" switches the converter of board ${board} on. `
                        + 'Stay at the bench. The procedure switches '
                        + 'it off at the end or on any error.',
                    ok: 'Switch on and run',
                    cancel: 'Cancel',
                }).open();
                if (!ok) {
                    return false;
                }
                powerToken = await this.service.issuePowerToken();
            }
            this.restoreBoard = await this.board.release();
        }
        this.current = { runId: -1, info, target, started: new Date(), log: [], records: [] };
        this.onDidChangeEmitter.fire();
        try {
            this.current.runId = await this.service.start({
                python: this.preferences.get<string>('ownstudio.python', ''),
                mission: root.path.fsPath(), procedure: info.path, target, board,
                powerToken,
            });
        } catch (error) {
            this.finish({ status: 2, error: error instanceof Error ? error.message : String(error) });
            return false;
        }
        return true;
    }

    /** Rerun the current board record on the simulator, at its filed conditions. */
    async simulateRecord(path: string): Promise<boolean> {
        const root = this.missions.root;
        const previous = this.current;
        const ownsBoardRecord = previous?.target === 'board' || previous?.simulationOf === path;
        if (!root || this.running || !previous?.done || !ownsBoardRecord
            || !previous.records.some(record => record.path === path)) {
            return false;
        }
        if (!previous.info.path || !previous.info.targets.includes('simulator')) {
            this.problem = 'This result does not name a procedure that can run on the simulator.';
            this.onDidChangeEmitter.fire();
            return false;
        }
        this.current = {
            runId: -1, info: previous.info, target: 'simulator', started: new Date(), log: [],
            records: [{ path, verdict: previous.records.find(record => record.path === path)?.verdict ?? '' }],
            simulationOf: path,
        };
        this.onDidChangeEmitter.fire();
        try {
            this.current.runId = await this.service.start({
                python: this.preferences.get<string>('ownstudio.python', ''),
                mission: root.path.fsPath(), procedure: previous.info.path, target: 'simulator', fromRecord: path,
            });
        } catch (error) {
            this.finish({ status: 2, error: error instanceof Error ? error.message : String(error) });
            return false;
        }
        return true;
    }

    /** Run a procedure on the simulator and wait for it (the agent's tool). Never the board. */
    async runOnSimulator(path: string): Promise<ProcedureRun> {
        await this.refresh();
        const info = this.procedures.find(p => p.path === path || p.path.endsWith(`/${path}`));
        if (!info) {
            throw new Error(`no procedure ${path}; the mission has ${this.procedures.map(p => p.path).join(', ') || 'none'}`);
        }
        if (!info.targets.includes('simulator')) {
            throw new Error(`${info.path} does not run on the simulator`);
        }
        if (this.running) {
            throw new Error('another procedure is running');
        }
        if (!await this.run(info, 'simulator')) {
            throw new Error(this.problem ?? 'the procedure did not start');
        }
        const run = this.current!;
        await new Promise<void>(resolve => {
            if (run.done) {
                resolve();
                return;
            }
            const listener = this.onDidChange(() => {
                if (run.done) {
                    listener.dispose();
                    resolve();
                }
            });
        });
        return run;
    }

    async answer(value: number | boolean | null): Promise<void> {
        const run = this.current;
        if (run?.ask) {
            const id = run.ask.id;
            run.ask = undefined;
            this.onDidChangeEmitter.fire();
            await this.service.answer(run.runId, id, value);
        }
    }

    async stop(): Promise<void> {
        if (this.current && !this.current.done) {
            await this.service.stop(this.current.runId);
        }
    }

    protected receive(runId: number, event: ProcedureEvent): void {
        const run = this.current;
        // A very short procedure may emit before start()'s RPC response carries
        // its id back. There is only one run at a time, so its first event owns
        // the pending (-1) run; later events still require the exact id.
        if (run?.runId === -1) {
            run.runId = runId;
        }
        if (!run || run.runId !== runId) {
            return;
        }
        switch (event.event) {
            case 'log': run.log.push(event.text); break;
            case 'ask': run.ask = { id: event.id, kind: event.kind, question: event.question }; break;
            case 'record': run.records.push({ path: event.path, verdict: event.verdict }); break;
            case 'done': this.finish(event); return;
        }
        this.onDidChangeEmitter.fire();
    }

    protected async finish(done: { status: number; error?: string }): Promise<void> {
        if (this.current) {
            this.current.done = done;
            this.current.ask = undefined;
        }
        this.onDidChangeEmitter.fire();
        const restore = this.restoreBoard;
        this.restoreBoard = undefined;
        await restore?.();
        await this.missions.refreshTests();
    }
}
