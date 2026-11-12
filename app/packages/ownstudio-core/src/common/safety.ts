// SPDX-License-Identifier: LGPL-2.1-only
// The safety panel's checks (SPEC §10, ADR 0009): the mission's envelope
// against the board's ratings, and each envelope limit against the
// protection chains that enforce it.
import { BoardPack, ProtectionChain, Quantity } from './board-pack.js';

export interface EnvelopeLimits { v_max_V?: number; i_max_A?: number; }
export type Envelope = Record<string, EnvelopeLimits>;

export const LIMITS: { key: keyof EnvelopeLimits; quantity: Quantity; unit: string; rating: 'v_max_V' | 'i_max_A' }[] = [
    { key: 'v_max_V', quantity: 'voltage', unit: 'V', rating: 'v_max_V' },
    { key: 'i_max_A', quantity: 'current', unit: 'A', rating: 'i_max_A' },
];

export type Coverage =
    | 'covered'      // an active chain trips at or below the limit
    | 'above'        // active chains exist, but all trip above the limit
    | 'inactive'     // only firmware chains, and the firmware doesn't enable them
    | 'none';        // no chain watches this quantity at this port

export interface LimitCheck {
    port: string;
    key: keyof EnvelopeLimits;
    unit: string;
    limit: number;
    rating: number | undefined;
    withinRating: boolean;
    coverage: Coverage;
    chains: { chain: ProtectionChain; active: boolean; atOrBelow: boolean }[];
}

export function checkEnvelope(envelope: Envelope, board: BoardPack, firmwareSafety: boolean): LimitCheck[] {
    const checks: LimitCheck[] = [];
    for (const [port, limits] of Object.entries(envelope)) {
        for (const l of LIMITS) {
            const limit = limits[l.key];
            if (limit === undefined) {
                continue;
            }
            const rating = board.ports[port]?.[l.rating]?.value;
            const chains = board.chains
                .filter(c => c.ports.includes(port) && c.quantity === l.quantity)
                .map(chain => ({ chain, active: chain.kind === 'passive' || firmwareSafety, atOrBelow: chain.threshold.value <= limit }));
            let coverage: Coverage;
            if (!chains.length) {
                coverage = 'none';
            } else if (chains.some(c => c.active && c.atOrBelow)) {
                coverage = 'covered';
            } else if (chains.some(c => c.active)) {
                coverage = 'above';
            } else {
                coverage = 'inactive';
            }
            checks.push({ port, key: l.key, unit: l.unit, limit, rating, withinRating: rating !== undefined && limit <= rating, coverage, chains });
        }
    }
    return checks;
}

/** Whether firmware sources call the board's Safety API enable function (comments ignored). */
export function firmwareEnablesSafety(sources: string[], enableCall: string | undefined): boolean {
    if (!enableCall) {
        return false;
    }
    const code = sources.map(s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n');
    return code.includes(enableCall + '(');
}

/**
 * Set one envelope value in mission.yaml's text, keeping everything else
 * (comments, layout) as it is. Works on the flow style the missions use:
 *   envelope:
 *     HIGH: {v_max_V: 60.0, i_max_A: 8.0}
 * Throws if the line isn't found in that form.
 */
export function setEnvelopeValue(text: string, port: string, key: keyof EnvelopeLimits, value: number): string {
    const lines = text.split('\n');
    const start = lines.findIndex(l => /^envelope:\s*(#.*)?$/.test(l));
    if (start < 0) {
        throw new Error("mission.yaml has no 'envelope:' section in the expected form");
    }
    for (let i = start + 1; i < lines.length && (/^\s/.test(lines[i]) || lines[i].trim() === '' || lines[i].startsWith('#')); i++) {
        const match = new RegExp(`^(\\s+${port}:\\s*\\{.*\\b${key}:\\s*)(-?[0-9.eE+-]+)(.*)$`).exec(lines[i]);
        if (match) {
            lines[i] = match[1] + formatNumber(value) + match[3];
            return lines.join('\n');
        }
    }
    throw new Error(`mission.yaml: no '${port}: {${key}: …}' line under 'envelope:'`);
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
}
