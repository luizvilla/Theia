// SPDX-License-Identifier: LGPL-2.1-only
// Requirements (requirements.yaml), and the states Home's Verification layer
// gives each requirement (SPEC §5). The states themselves are computed by
// ownstudio_lab.testing; see test-states.ts.
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

export type RequirementState =
    | 'no-case'      // no test case verifies it
    | 'untested'     // its test cases have no record yet
    | 'sim-pass'     // passed in simulation (latest record)
    | 'bench-pass'   // passed on the board (latest record)
    | 'fail'         // the latest record on a target failed
    | 'known'        // it fails, and the failure is in the findings register with its issue
    | 'disagree';    // simulation and bench disagree


export const STATE_LABEL: Record<RequirementState, string> = {
    'no-case': 'No test case',
    'untested': 'Untested',
    'sim-pass': 'Passed in simulation',
    'bench-pass': 'Passed on the bench',
    'fail': 'Failed',
    'known': 'Failing (known issue)',
    'disagree': 'Simulation and bench disagree',
};

export function parseRequirements(text: string): Requirement[] {
    const raw = load(text) as { requirements?: Requirement[] } | undefined;
    if (!raw || !Array.isArray(raw.requirements)) {
        throw new Error("requirements.yaml has no 'requirements' list");
    }
    return raw.requirements.map(r => ({ ...r, verified_by: r.verified_by ?? [] }));
}
