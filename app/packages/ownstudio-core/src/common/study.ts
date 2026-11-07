// SPDX-License-Identifier: LGPL-2.1-only
// The first student study (plan.md, "What the study measures"): the time each
// mission step takes, the System Usability Scale, and three open questions on
// the Design workbench. Logged locally, only after consent, as JSON lines.

export type StudyEventKind = 'consent' | 'step-start' | 'step-done' | 'sus' | 'answers' | 'withdraw';

export interface StudyEvent {
    /** ISO 8601 time. */
    t: string;
    participant: string;
    mission: string;
    kind: StudyEventKind;
    step?: string;
    /** SUS: the ten answers, 1 to 5; answers: the open answers by question id. */
    data?: number[] | Record<string, string>;
}

/** A participant code: letters, digits and dashes, no name (P03, PHD-2...). */
export function validParticipant(code: string): boolean {
    return /^[A-Za-z0-9-]{1,16}$/.test(code);
}

/**
 * The System Usability Scale (Brooke, 1996), its ten statements in their usual
 * English wording, answered from 1 (strongly disagree) to 5 (strongly agree).
 */
export const SUS_ITEMS: string[] = [
    'I think that I would like to use this system frequently.',
    'I found the system unnecessarily complex.',
    'I thought the system was easy to use.',
    'I think that I would need the support of a technical person to be able to use this system.',
    'I found the various functions in this system were well integrated.',
    'I thought there was too much inconsistency in this system.',
    'I would imagine that most people would learn to use this system very quickly.',
    'I found the system very cumbersome to use.',
    'I felt very confident using the system.',
    'I needed to learn a lot of things before I could get going with this system.',
];

/** SUS score, 0 to 100: odd items count (answer − 1), even items (5 − answer), the sum times 2.5. */
export function susScore(answers: number[]): number | undefined {
    if (answers.length !== 10 || answers.some(a => !Number.isInteger(a) || a < 1 || a > 5)) {
        return undefined;
    }
    return answers.reduce((sum, a, i) => sum + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
}

/** The three open questions on the breadth and depth of the Design workbench (drafts for Luiz). */
export const OPEN_QUESTIONS: { id: string; question: string }[] = [
    { id: 'design-helped', question: 'Which parts of Design (requirements, sizing, the Bode plot) helped you decide what to change, and which did you skip? Why?' },
    { id: 'design-missing', question: 'What did you want to calculate or see in Design that it did not offer?' },
    { id: 'design-depth', question: 'Where did Design go deeper than you needed, or not deep enough, for you to trust your choice of L, C and the PI gains?' },
];

export interface StepTime {
    step: string;
    /** First start. */
    started?: string;
    /** Last "done". */
    done?: string;
    /** Seconds spent: each start until the next done, summed (a step reopened counts again). */
    seconds?: number;
    /** How many times the step was started. */
    starts: number;
}

/** Time spent on each step, in the order steps were first started. */
export function stepTimes(events: StudyEvent[]): StepTime[] {
    const out = new Map<string, StepTime & { open?: number }>();
    for (const e of events) {
        if (!e.step || (e.kind !== 'step-start' && e.kind !== 'step-done')) {
            continue;
        }
        const s = out.get(e.step) ?? { step: e.step, starts: 0 };
        const at = Date.parse(e.t);
        if (e.kind === 'step-start') {
            s.started = s.started ?? e.t;
            s.starts++;
            s.open = s.open ?? at;
        } else {
            s.done = e.t;
            if (s.open !== undefined) {
                s.seconds = (s.seconds ?? 0) + (at - s.open) / 1000;
                s.open = undefined;
            }
        }
        out.set(e.step, s);
    }
    return [...out.values()].map(({ open, ...s }) => s);
}

/** JSON lines in, events out; a damaged line is skipped, never fatal. */
export function parseLog(text: string): StudyEvent[] {
    const events: StudyEvent[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        try {
            events.push(JSON.parse(line));
        } catch {
            // skip
        }
    }
    return events;
}

/** One CSV row per step, for the analysis: participant, mission, step, started, done, seconds, starts. */
export function stepTimesCsv(participant: string, mission: string, events: StudyEvent[]): string {
    const rows = stepTimes(events).map(s =>
        [participant, mission, s.step, s.started ?? '', s.done ?? '', s.seconds?.toFixed(1) ?? '', s.starts].join(','));
    return ['participant,mission,step,started,done,seconds,starts', ...rows].join('\n') + '\n';
}
