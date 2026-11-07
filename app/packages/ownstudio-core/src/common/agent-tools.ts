// SPDX-License-Identifier: LGPL-2.1-only
// The pure parts of the OwnStudio agent's tools: which files it may read or
// change, and how results are told back to the model (plain, short text).
import { TestStates, caseVerdict, formatMeasured, stateInfo } from './test-states';

/** Files the agent may propose changes to (ADR 0010: the control law, nothing that touches safety). */
export const EDITABLE_FILES = ['firmware/control.cpp', 'firmware/control.h'];

/** A path inside the mission, relative, without '..', and not a binary or the records. */
export function readablePath(path: string): string | undefined {
    const clean = path.trim().replace(/^\.\/+/, '');
    if (!clean || clean.startsWith('/') || clean.split('/').some(part => part === '..' || part === '')
        || /^(records|bin|\.git)(\/|$)/.test(clean) || /\.(bin|so|dll|png|jpg|elf)$/i.test(clean)) {
        return undefined;
    }
    return clean;
}

export function editablePath(path: string): string | undefined {
    const clean = readablePath(path);
    return clean && EDITABLE_FILES.includes(clean) ? clean : undefined;
}

export function summarizeTestStates(states: TestStates): string {
    const lines = ['Tests (state, id, latest measured values):'];
    for (const t of states.tests) {
        const cases = t.latest?.cases.map(c => `${c.id} ${formatMeasured(c)} ${caseVerdict(c)}`).join('; ') ?? 'no record';
        lines.push(`- ${stateInfo(t.state).word}: ${t.id} (${t.title}; criterion ${t.criterion}) → ${cases}`
            + (t.finding ? ` [known issue ${t.finding.issue}]` : ''));
    }
    lines.push('Requirements:');
    for (const r of states.requirements) {
        lines.push(`- ${r.id} (${r.title}): ${r.state}, verified by ${r.tests.join(', ') || 'nothing'}`);
    }
    if (states.findings.length) {
        lines.push('Findings register:');
        for (const f of states.findings) {
            lines.push(`- ${f.issue}: ${f.criteria.join(', ')}: ${f.cause} (${f.status})`);
        }
    }
    return lines.join('\n');
}

export interface RunSummaryInput {
    title: string;
    target: string;
    status: number;
    error?: string;
    log: string[];
    records: { path: string; verdict: string }[];
}

export function summarizeRun(run: RunSummaryInput): string {
    const head = `${run.title} on the ${run.target}: ${run.status === 0 ? 'every criterion passed'
        : run.status === 1 ? 'a criterion failed' : 'it could not run'}.`;
    const records = run.records.map(r => `record ${r.path.split('/').slice(-2).join('/')}: ${r.verdict}`);
    const log = run.log.slice(-20);
    return [head, ...(run.error ? [`error: ${run.error}`] : []), ...records, 'log:', ...log].join('\n');
}
