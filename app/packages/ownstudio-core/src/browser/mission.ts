// SPDX-License-Identifier: LGPL-2.1-only
// The parts of a mission.yaml that Home draws (see the mission's own file for the full format).
import { load } from 'js-yaml';

export type BlockKey = 'power' | 'measurement' | 'controller' | 'driver' | 'aps';
export const BLOCK_KEYS: BlockKey[] = ['power', 'measurement', 'controller', 'driver', 'aps'];

export interface Block { title: string; summary: string; opens?: string | null; }
export interface Port { side: 'high' | 'low'; kind: string; direction: 'in' | 'out' | 'both'; connect: string; }
export interface Envelope { v_max_V?: number; i_max_A?: number; }

export interface Mission {
    id: string;
    title: string;
    summary: string;
    board: { pack: string; version: string };
    blocks: Record<BlockKey, Block>;
    ports: Record<string, Port>;
    envelope: Record<string, Envelope>;
}

/** Parse mission.yaml text; throws with a readable message when a required part is missing. */
export function parseMission(text: string): Mission {
    const raw = load(text) as Partial<Mission> | undefined;
    if (!raw || typeof raw !== 'object') {
        throw new Error('mission.yaml is empty or not a mapping');
    }
    for (const key of ['title', 'board', 'blocks', 'ports'] as const) {
        if (!raw[key]) {
            throw new Error(`mission.yaml has no '${key}'`);
        }
    }
    for (const key of BLOCK_KEYS) {
        if (!raw.blocks![key]) {
            throw new Error(`mission.yaml has no '${key}' block`);
        }
    }
    return { id: '', summary: '', envelope: {}, ...raw } as Mission;
}

/** Break text into lines of at most `width` characters, on spaces. */
export function wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (line && (line + ' ' + word).length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line) {
        lines.push(line);
    }
    return lines;
}
