// SPDX-License-Identifier: LGPL-2.1-only
// Where a mission's validation stands, as computed by ownstudio_lab.testing
// (Python) from tests/catalogue.yaml, the test records and tests/findings.yaml.
// The app only shows it; the states are computed in one place.
import { RequirementState } from './verification';

export type TestState = 'fail' | 'known' | 'blocked_run' | 'pass' | 'info' | 'not_run' | 'blocked' | 'planned';

/** Core2's states, worst first. Colour is never the only cue: each has an icon and a word. */
export const TEST_STATES: { id: TestState; icon: string; word: string }[] = [
    { id: 'fail', icon: '✗', word: 'Failing' },
    { id: 'known', icon: '✗', word: 'Failing (known)' },
    { id: 'blocked_run', icon: '–', word: 'Blocked in last run' },
    { id: 'pass', icon: '✓', word: 'Passed' },
    { id: 'info', icon: 'i', word: 'Run (information only)' },
    { id: 'not_run', icon: '○', word: 'Not run yet' },
    { id: 'blocked', icon: '–', word: 'Blocked' },
    { id: 'planned', icon: '◌', word: 'Not implemented' },
];

export function stateInfo(state: TestState): { icon: string; word: string } {
    return TEST_STATES.find(s => s.id === state) ?? { icon: '?', word: state };
}

export interface CaseResult {
    id: string;
    title: string;
    criterion?: string;
    measured?: number | string;
    expected?: number | string;
    unit?: string;
    passed?: boolean;
    verdict?: 'BLOCKED' | 'INFO';
    reason?: string;
}

export interface LatestRun {
    date: string;
    campaign: string;
    /** Folder of the record, absolute file-system path. */
    path: string;
    target: string;
    board?: { serial_number: string; commit: string; dirty: boolean; source_hash: string };
    mission?: { commit: string; dirty: boolean };
    /** The record run with it on the other target (a board run's simulation), relative to the campaign. */
    twin?: string | null;
    cases: CaseResult[];
}

export interface TestEntry {
    id: string;
    tab: string;
    level: string | string[];
    title: string;
    criterion: string;
    status: 'implemented' | 'partial' | 'planned' | 'blocked';
    target: string | string[];
    requirements?: string[];
    blocked_by?: string;
    notes?: string;
    /** Blocks of mission.yaml the test exercises on every target, and only on the board. */
    blocks?: string[];
    board_blocks?: string[];
    state: TestState;
    latest: LatestRun | null;
    /** The state of each target's newest record; the test's state is the worst of them. */
    targets?: Record<string, { state: TestState; date: string; path: string }>;
    finding: { issue: string; cause: string } | null;
}

export type BlockState = TestState | 'no_test';

/** A block of the converter, as its tests leave it. */
export interface BlockResult {
    state: BlockState;
    tests: string[];
    counts: Partial<Record<TestState, number>>;
    /** Targets its passes come from: board, simulator, pc. */
    evidence: string[];
}

export interface RequirementResult { id: string; title: string; state: RequirementState; tests: string[]; }

export interface Finding {
    issue: string;
    criteria: string[];
    cause: string;
    owner?: string;
    status: string;
    blocks?: string;
    ready_to_close: boolean;
}

export interface TestStates {
    tabs: { id: string; title: string; question?: string }[];
    tests: TestEntry[];
    requirements: RequirementResult[];
    findings: Finding[];
    unknown_cases: string[];
    campaigns: string[];
    blocks?: Record<string, BlockResult>;
}

export function blockInfo(b: BlockResult | undefined): { icon: string; word: string; evidence: string; colour: string } {
    if (!b || b.state === 'no_test') {
        return { icon: '◌', word: 'No test', evidence: '', colour: 'no-case' };
    }
    const info = stateInfo(b.state);
    // Where the passes come from, said only of a passing block: next to a failure it would mislead.
    const evidence = b.state !== 'pass' ? '' : b.evidence.includes('board') ? 'shown on the board'
        : b.evidence.includes('simulator') ? 'simulation only'
            : b.evidence.includes('pc') ? 'on the PC only' : '';
    // Same colours as the requirements: a pass on the board is a bench pass.
    const colour = b.state === 'fail' ? 'fail' : b.state === 'known' ? 'known'
        : b.state === 'pass' ? (b.evidence.includes('board') ? 'bench-pass' : 'sim-pass') : 'untested';
    return { ...info, evidence, colour };
}

/** "10 passed, 1 failing (known), 1 not run yet": the block's tests by state, worst first. */
export function blockCounts(b: BlockResult): string {
    return TEST_STATES.filter(s => b.counts[s.id]).map(s => `${b.counts[s.id]} ${s.word.toLowerCase()}`).join(', ');
}

export function caseVerdict(c: CaseResult): 'PASS' | 'FAIL' | 'BLOCKED' | 'INFO' {
    return c.verdict ?? (c.passed ? 'PASS' : 'FAIL');
}

/** How many tests are in each state, in TEST_STATES order, leaving out empty states. */
export function countStates(tests: TestEntry[]): { id: TestState; count: number }[] {
    return TEST_STATES.map(s => ({ id: s.id, count: tests.filter(t => t.state === s.id).length })).filter(s => s.count > 0);
}

export function formatMeasured(c: CaseResult): string {
    if (c.measured === undefined) {
        return '—';
    }
    const value = typeof c.measured === 'number' ? Number(c.measured.toPrecision(4)).toString() : c.measured;
    return c.unit ? `${value} ${c.unit}` : value;
}
