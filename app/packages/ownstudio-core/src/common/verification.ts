// SPDX-License-Identifier: LGPL-2.1-only
// Requirements (requirements.yaml) and test records (records/*/record.json),
// and the state Home's Verification layer gives each requirement (SPEC §5).
import { load } from 'js-yaml';

export interface Requirement {
    id: string;
    title: string;
    statement: string;
    port?: string;
    block?: string;
    value?: number;
    unit?: string;
    verified_by: string[];
}

export interface RecordCase {
    id: string;
    requirement?: string;
    title: string;
    measured: number | string;
    expected: number | string;
    unit?: string;
    criterion: string;
    passed: boolean;
}

export interface TestRecord {
    procedure: string;
    level: string;
    target: string;           // 'simulator' or 'board'
    date: string;             // ISO 8601
    verdict: 'PASS' | 'FAIL';
    cases: RecordCase[];
    board?: { serial_number: string; source_hash: string; commit: string; dirty: boolean };
    /** Folder of the record, relative to the mission. */
    folder: string;
}

export type RequirementState =
    | 'no-case'      // no test case verifies it
    | 'untested'     // its test cases have no record yet
    | 'sim-pass'     // passed in simulation (latest record)
    | 'bench-pass'   // passed on the board (latest record)
    | 'fail'         // the latest record on a target failed
    | 'disagree';    // simulation and bench disagree

export interface TargetResult { passed: boolean; record: TestRecord; cases: RecordCase[]; }
export interface Verification { state: RequirementState; simulator?: TargetResult; board?: TargetResult; }

export const STATE_LABEL: Record<RequirementState, string> = {
    'no-case': 'No test case',
    'untested': 'Untested',
    'sim-pass': 'Passed in simulation',
    'bench-pass': 'Passed on the bench',
    'fail': 'Failed',
    'disagree': 'Simulation and bench disagree',
};

export function parseRequirements(text: string): Requirement[] {
    const raw = load(text) as { requirements?: Requirement[] } | undefined;
    if (!raw || !Array.isArray(raw.requirements)) {
        throw new Error("requirements.yaml has no 'requirements' list");
    }
    return raw.requirements.map(r => ({ ...r, verified_by: r.verified_by ?? [] }));
}

/** Parse a record.json; undefined if it isn't one. */
export function parseRecord(text: string, folder: string): TestRecord | undefined {
    try {
        const raw = JSON.parse(text);
        if (!Array.isArray(raw.cases) || typeof raw.date !== 'string' || typeof raw.target !== 'string') {
            return undefined;
        }
        return { ...raw, folder };
    } catch {
        return undefined;
    }
}

/** The latest record on a target that contains any of the cases. */
function latest(records: TestRecord[], target: string, caseIds: string[]): TargetResult | undefined {
    const candidates = records
        .filter(r => r.target === target && r.cases.some(c => caseIds.includes(c.id)))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const record = candidates[0];
    if (!record) {
        return undefined;
    }
    const cases = record.cases.filter(c => caseIds.includes(c.id));
    return { record, cases, passed: cases.every(c => c.passed) };
}

export function verify(requirement: Requirement, records: TestRecord[]): Verification {
    if (!requirement.verified_by.length) {
        return { state: 'no-case' };
    }
    const simulator = latest(records, 'simulator', requirement.verified_by);
    const board = latest(records, 'board', requirement.verified_by);
    let state: RequirementState;
    if (!simulator && !board) {
        state = 'untested';
    } else if (simulator && board && simulator.passed !== board.passed) {
        state = 'disagree';
    } else if ((simulator && !simulator.passed) || (board && !board.passed)) {
        state = 'fail';
    } else if (board) {
        state = 'bench-pass';
    } else {
        state = 'sim-pass';
    }
    return { state, simulator, board };
}
