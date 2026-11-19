// SPDX-License-Identifier: LGPL-2.1-only
// Running a mission procedure (python -m ownstudio_lab.procedure --json) from the
// app: the backend spawns the runner and relays its JSON-lines events.

export const PROCEDURE_SERVICE_PATH = '/services/ownstudio-procedure';
export const ProcedureService = Symbol('ProcedureService');

export interface ProcedureInfo {
    path: string;            // relative to the mission
    title: string;
    targets: string[];
    tests: string[];
    level: string;
    power_on: boolean;
    doc: string;
    problem?: string;
    /** Board-supplied default capture, shown as a form in the Lab. */
    capture?: {
        channels: { label: string; object: string; unit: string }[];
        reference: { group: string; name: string; from: number; to: number; unit: string };
        duration_s: number;
        pretrigger_s: number;
        sample_period_s: number;
    };
}

/** F4 (Q175): a simulator run's progress: a stage, or simulated time over the total expected. */
export interface ProcedureProgress {
    stage?: string;
    fraction?: number | null;
    simulated_s?: number;
    total_s?: number;
    elapsed_s?: number;
    left_s?: number | null;
}

export type ProcedureEvent =
    | { event: 'log'; text: string }
    | { event: 'ask'; id: number; kind: 'number' | 'confirm'; question: string }
    | { event: 'record'; path: string; verdict: 'PASS' | 'FAIL' | 'BLOCKED' }
    | ({ event: 'progress' } & ProcedureProgress)
    | { event: 'done'; status: number; error?: string };

export interface ProcedureStart {
    python: string;          // empty: OWNSTUDIO_PYTHON, then python3
    mission: string;         // file-system path
    procedure: string;       // relative to the mission
    target: 'simulator' | 'board';
    board?: string;
    /** Filed board-record folder: rerun only its simulator phase and link the records. */
    fromRecord?: string;
    /** One-use capability returned by issuePowerToken after the confirmation dialog. */
    powerToken?: string;
}

export interface ProcedureClient {
    onProcedureEvent(runId: number, event: ProcedureEvent): void;
}

export interface ProcedureService {
    setClient(client: ProcedureClient | undefined): void;
    issuePowerToken(): Promise<string>;
    start(options: ProcedureStart): Promise<number>;
    /** Answer a question; null cancels the procedure. */
    answer(runId: number, id: number, answer: number | boolean | null): Promise<void>;
    stop(runId: number): Promise<void>;
}

/** Status of the runner process: 0 every record passed, 1 a record failed, 2 it could not run. */
export function statusText(status: number): string {
    return status === 0 ? 'passed' : status === 1 ? 'a criterion failed' : 'could not run';
}
