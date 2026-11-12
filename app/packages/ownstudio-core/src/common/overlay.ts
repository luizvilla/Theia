// SPDX-License-Identifier: LGPL-2.1-only
// A board run next to its simulation: requirement bands, both waveforms on one
// time axis, and each case on both targets (records linked by "twin").

import { Waveform } from './waveform';

export interface RecordCase {
    id: string;
    title: string;
    criterion?: string;
    reason?: string;
    measured?: number | string | null;
    expected?: number | string | null;
    unit?: string;
    passed?: boolean;
    verdict?: string;
    /** Time span of the waveform this case judges, in seconds on the waveform's t axis. */
    window_s?: [number, number];
}

export interface TestRecord {
    procedure: string;
    level?: string;
    target: string;
    verdict: string;
    date?: string;
    conditions?: Record<string, number | string>;
    twin?: string;
    report?: string;
    board?: { serial_number?: string; commit?: string };
    cases: RecordCase[];
}

export interface Band {
    caseId: string;
    low: number;
    high: number;
    t0: number;
    t1: number;
    label: string;
}

export interface OverlayRow {
    id: string;
    title: string;
    criterion: string;
    unit: string;
    simulation?: number | string;
    board?: number | string;
    simulationVerdict?: string;
    boardVerdict?: string;
    /** board − simulation, when both are numbers. */
    difference?: number;
}

export function caseVerdict(c: RecordCase): string {
    return c.verdict ?? (c.passed === undefined ? '—' : c.passed ? 'PASS' : 'FAIL');
}

/** "within 2 %" → ±2 % around the expected value; "at least 95 %" → a floor at 95 % of it. */
export function tolerance(criterion: string | undefined): { kind: 'within' | 'at-least'; fraction: number } | undefined {
    const within = /within\s*±?\s*(\d+(?:\.\d+)?)\s*%/i.exec(criterion ?? '');
    if (within) {
        return { kind: 'within', fraction: Number(within[1]) / 100 };
    }
    const least = /at least\s*(\d+(?:\.\d+)?)\s*%/i.exec(criterion ?? '');
    if (least) {
        return { kind: 'at-least', fraction: Number(least[1]) / 100 };
    }
    return undefined;
}

/** Requirement bands of the voltage cases over [t0, t1] (each case's own window if it has one). */
export function bands(cases: RecordCase[], t0: number, t1: number): Band[] {
    const out: Band[] = [];
    for (const c of cases) {
        const expected = typeof c.expected === 'number' ? c.expected : undefined;
        const tol = tolerance(c.criterion);
        if (expected === undefined || !tol || c.unit !== 'V') {
            continue;
        }
        const [a, b] = c.window_s ?? [t0, t1];
        const low = tol.kind === 'within' ? expected * (1 - tol.fraction) : expected * tol.fraction;
        const high = tol.kind === 'within' ? expected * (1 + tol.fraction) : expected;
        out.push({ caseId: c.id, low, high, t0: Math.max(a, t0), t1: Math.min(b, t1), label: `${c.id}: ${c.criterion}` });
    }
    return out.filter(b => b.t1 > b.t0);
}

/** Each case of the board record next to the same case of its simulation. */
export function compareCases(board: TestRecord, simulation: TestRecord | undefined): OverlayRow[] {
    const sim = new Map((simulation?.cases ?? []).map(c => [c.id, c]));
    return board.cases.map(b => {
        const s = sim.get(b.id);
        const value = (c: RecordCase | undefined) => c?.measured ?? (c ? c.reason ?? '—' : undefined);
        const row: OverlayRow = {
            id: b.id, title: b.title, criterion: b.criterion ?? '', unit: b.unit ?? s?.unit ?? '',
            board: value(b) ?? undefined, simulation: value(s) ?? undefined,
            boardVerdict: caseVerdict(b), simulationVerdict: s ? caseVerdict(s) : undefined,
        };
        if (typeof b.measured === 'number' && typeof s?.measured === 'number') {
            row.difference = b.measured - s.measured;
        }
        return row;
    });
}

/** The samples of w with t0 ≤ t ≤ t1. */
export function clip(w: Waveform, t0: number, t1: number): Waveform {
    const t: number[] = [];
    const v: number[] = [];
    w.t.forEach((x, i) => {
        if (x >= t0 && x <= t1) {
            t.push(x);
            v.push(w.v[i]);
        }
    });
    return { t, v };
}

/** Folder of a record's twin: "twin" is relative to the campaign, the record's parent folder. */
export function twinPath(recordPath: string, twin: string): string {
    return `${recordPath.replace(/[\\/][^\\/]*[\\/]?$/, '')}/${twin}`;
}

/** The conditions a record was run at, for display: "v_high_V 29.4 · load_ohm 33". */
export function formatConditions(conditions: TestRecord['conditions']): string {
    return Object.entries(conditions ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ');
}
