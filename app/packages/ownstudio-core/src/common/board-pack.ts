// SPDX-License-Identifier: LGPL-2.1-only
// Board descriptions (board packs, ADR 0017). The format is documented by
// example in applications/electron/boardpacks/twist/board.yaml.
import { load } from 'js-yaml';

export interface Sourced<T = number> { value: T; source: string; check?: string; per?: string; }

export interface PortRating {
    side: 'high' | 'low';
    kinds: string[];
    v_min_V: Sourced;
    v_max_V: Sourced;
    v_abs_max_V: Sourced;
    i_max_A: Sourced;
}

export type BridgeBlock = 'measurement' | 'driver' | 'aps';
export const BRIDGE_BLOCKS: BridgeBlock[] = ['measurement', 'driver', 'aps'];
export interface BlockIsolation { isolated: boolean; parts: string; source: string; }

export type Quantity = 'voltage' | 'current' | 'temperature';
export const UNIT: Record<Quantity, string> = { voltage: 'V', current: 'A', temperature: 'degC' };

export interface ProtectionChain {
    id: string;
    title: string;
    kind: 'passive' | 'firmware';
    ports: string[];
    quantity: Quantity;
    /** Trips above this value, in UNIT[quantity]. */
    threshold: Sourced;
    action: string;
    sensor?: string;
}

export interface BoardPack {
    board: string;
    title: string;
    maker: string;
    summary: string;
    sources: Record<string, string>;
    revisions: { version: string; core_shield: string; usb_product: string }[];
    ports: Record<string, PortRating>;
    power: Record<string, Sourced<number | string>>;
    blocks: Record<BridgeBlock, BlockIsolation>;
    chains: ProtectionChain[];
    firmwareSafety: { enableCall: string; api: string } | undefined;
}

export class BoardPackError extends Error {
    constructor(readonly problems: string[]) {
        super(`board.yaml: ${problems.join('; ')}`);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** Parse and check a board.yaml. Lists every problem found, not only the first. */
export function parseBoardPack(text: string): BoardPack {
    const raw: Raw = load(text);
    const problems: string[] = [];
    const need = (ok: unknown, problem: string) => { if (!ok) { problems.push(problem); } };
    if (!raw || typeof raw !== 'object') {
        throw new BoardPackError(['empty or not a mapping']);
    }
    need(raw.format === 1, `unsupported format ${raw.format} (expected 1)`);
    for (const key of ['board', 'title', 'ports', 'blocks', 'protection_chains', 'revisions']) {
        need(raw[key] !== undefined, `missing '${key}'`);
    }
    const sourced = (where: string, item: Raw) => {
        need(item && typeof item === 'object' && 'value' in item, `${where}: expected {value, source}`);
        need(item && typeof item.source === 'string' && item.source.length > 0, `${where}: every value needs a source`);
    };

    const ports: Record<string, PortRating> = raw.ports ?? {};
    for (const [name, port] of Object.entries<Raw>(ports)) {
        need(port.side === 'high' || port.side === 'low', `port ${name}: side must be high or low`);
        for (const key of ['v_min_V', 'v_max_V', 'v_abs_max_V', 'i_max_A']) {
            sourced(`port ${name} ${key}`, port[key]);
            need(typeof port[key]?.value === 'number', `port ${name} ${key}: must be a number`);
        }
        if (typeof port.v_max_V?.value === 'number' && typeof port.v_abs_max_V?.value === 'number') {
            need(port.v_max_V.value <= port.v_abs_max_V.value, `port ${name}: v_max_V above its absolute maximum`);
        }
        if (typeof port.v_min_V?.value === 'number' && typeof port.v_max_V?.value === 'number') {
            need(port.v_min_V.value < port.v_max_V.value, `port ${name}: v_min_V not below v_max_V`);
        }
    }

    const blocks = (raw.blocks ?? {}) as Record<BridgeBlock, BlockIsolation>;
    for (const block of BRIDGE_BLOCKS) {
        const b: Raw = blocks[block];
        need(b && typeof b.isolated === 'boolean', `block ${block}: 'isolated' must be true or false`);
        need(b && typeof b.source === 'string', `block ${block}: needs a source`);
    }

    const chains: ProtectionChain[] = [];
    const ids = new Set<string>();
    for (const c of (raw.protection_chains ?? []) as Raw[]) {
        const where = `chain ${c.id ?? '?'}`;
        need(typeof c.id === 'string' && !ids.has(c.id), `${where}: id missing or used twice`);
        ids.add(c.id);
        need(c.kind === 'passive' || c.kind === 'firmware', `${where}: kind must be passive or firmware`);
        need(c.quantity in UNIT, `${where}: quantity must be voltage, current or temperature`);
        for (const port of c.ports ?? []) {
            need(port in ports, `${where}: unknown port ${port}`);
        }
        const key = `trips_above_${UNIT[c.quantity as Quantity] ?? '?'}`;
        sourced(`${where} ${key}`, c[key]);
        chains.push({
            id: c.id, title: c.title ?? c.id, kind: c.kind, ports: c.ports ?? [], quantity: c.quantity,
            threshold: c[key], action: c.action ?? '', sensor: c.sensor,
        });
    }

    for (const r of (raw.revisions ?? []) as Raw[]) {
        need(typeof r.version === 'string' && typeof r.usb_product === 'string', 'revisions: each needs a version and a usb_product');
    }

    if (problems.length) {
        throw new BoardPackError(problems);
    }
    return {
        board: raw.board, title: raw.title, maker: raw.maker ?? '', summary: raw.summary ?? '',
        sources: raw.sources ?? {}, revisions: raw.revisions, ports, power: raw.power ?? {}, blocks, chains,
        firmwareSafety: raw.firmware_safety ? { enableCall: raw.firmware_safety.enable_call, api: raw.firmware_safety.api ?? '' } : undefined,
    };
}

/** The pack revision a running board reports through its USB product name. */
export function revisionOf(pack: BoardPack, usbProduct: string): string | undefined {
    return pack.revisions.find(r => r.usb_product === usbProduct)?.version;
}
