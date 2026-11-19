// SPDX-License-Identifier: LGPL-2.1-only
// The setup canvas as data (ADR 0026, SPEC §6): parts with typed ports, the
// first topology rules, and the canvas section of ownstudio/setup.yaml.
// The canvas widget draws this; the rules decide what may be added and wired.

export type PartKind = 'source' | 'board' | 'load';
export type PortType = 'power';

export interface PortDef {
    id: string;
    label: string;
    type: PortType;
    side: 'left' | 'right';
    /** What may be wired to this port (board ports only): the kinds of part. */
    accepts?: PartKind[];
}

export interface PartDef {
    part: string;                  // "dc-source", "twist", "resistor"
    kind: PartKind;
    label: string;
    colour: string;
    ports: PortDef[];
    /** Values shown on the node, with their defaults. */
    values: { key: string; label: string; unit: string; default: number }[];
}

export const PARTS: PartDef[] = [
    {
        part: 'dc-source', kind: 'source', label: 'DC source', colour: '#b2532a',
        ports: [{ id: 'out', label: '+', type: 'power', side: 'right' }],
        values: [{ key: 'voltage', label: 'Voltage', unit: 'V', default: 30 }, { key: 'limit', label: 'Limit', unit: 'A', default: 1 }],
    },
    {
        part: 'twist', kind: 'board', label: 'Twist 1.4.2', colour: '#1f5a46',
        ports: [
            { id: 'HIGH', label: 'HIGH', type: 'power', side: 'left', accepts: ['source'] },
            { id: 'LOW1', label: 'LOW1', type: 'power', side: 'right', accepts: ['load'] },
            { id: 'LOW2', label: 'LOW2', type: 'power', side: 'right', accepts: ['load'] },
        ],
        // The defaults are the board plant's (boards/twist/plant/README.md); the Design sheets change them.
        values: [{ key: 'inductance_H', label: 'L per leg', unit: 'H', default: 33e-6 },
            { key: 'capacitance_F', label: 'C per leg', unit: 'F', default: 14.1e-6 }],
    },
    {
        part: 'resistor', kind: 'load', label: 'Resistor', colour: '#2c6f9e',
        ports: [{ id: 'in', label: '+', type: 'power', side: 'left' }],
        values: [{ key: 'ohm', label: 'Value', unit: 'Ω', default: 33 }],
    },
];

export interface CanvasNode { id: string; part: string; x?: number; y?: number; values?: Record<string, number> }
export interface WireEnd { node: string; port: string }
export interface CanvasWire { from: WireEnd; to: WireEnd }
export interface CanvasProbe { kind: 'monitor' | 'capture'; label: string; object: string; unit?: string; }
export interface Canvas { nodes: CanvasNode[]; wires: CanvasWire[]; probes?: CanvasProbe[] }

export type Verdict = { ok: true } | { ok: false; reason: string };
const ok: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const partDef = (part: string): PartDef | undefined => PARTS.find(p => p.part === part);
const kindOf = (canvas: Canvas, nodeId: string): PartKind | undefined => partDef(canvas.nodes.find(n => n.id === nodeId)?.part ?? '')?.kind;

/** First version (SPEC §6): one source, one Twist, any number of loads on LOW1 and LOW2. */
export function canAdd(canvas: Canvas, part: string): Verdict {
    const def = partDef(part);
    if (!def) {
        return no(`${part} is not a part OwnStudio knows.`);
    }
    if (def.kind === 'board' && canvas.nodes.some(n => kindOf(canvas, n.id) === 'board')) {
        return no('A setup has one board.');
    }
    if (def.kind === 'source' && canvas.nodes.some(n => kindOf(canvas, n.id) === 'source')) {
        return no('A setup has one source, on HIGH.');
    }
    return ok;
}

/** May a wire join these two ports? Wires go between a part and the board, power to power. */
export function canConnect(canvas: Canvas, a: WireEnd, b: WireEnd): Verdict {
    const ka = kindOf(canvas, a.node);
    const kb = kindOf(canvas, b.node);
    if (!ka || !kb) {
        return no('Both ends must be parts on the canvas.');
    }
    if (a.node === b.node) {
        return no('A wire joins two different parts.');
    }
    if (ka !== 'board' && kb !== 'board') {
        return no('Parts connect through the board: wire each one to a port of the Twist.');
    }
    if (ka === 'board' && kb === 'board') {
        return no('A setup has one board.');
    }
    const [boardEnd, partEnd, partKind] = ka === 'board' ? [a, b, kb] : [b, a, ka];
    const boardDef = partDef(canvas.nodes.find(n => n.id === boardEnd.node)!.part)!;
    const port = boardDef.ports.find(p => p.id === boardEnd.port);
    const partPort = partDef(canvas.nodes.find(n => n.id === partEnd.node)!.part)!.ports.find(p => p.id === partEnd.port);
    if (!port || !partPort) {
        return no('Unknown port.');
    }
    if (port.type !== partPort.type) {
        return no(`${port.label} takes ${port.type} wires only.`);
    }
    if (!port.accepts?.includes(partKind)) {
        if (partKind === 'load') {
            return no('A load can only connect to LOW1 or LOW2. HIGH takes the source.');
        }
        if (partKind === 'source') {
            return no('A source can only connect to HIGH. LOW1 and LOW2 take loads.');
        }
        return no(`${port.label} does not take a ${partKind}.`);
    }
    const taken = (end: WireEnd) => canvas.wires.some(w => sameEnd(w.from, end) || sameEnd(w.to, end));
    if (taken(partEnd)) {
        return no('That part is already wired.');
    }
    if (port.id === 'HIGH' && taken(boardEnd)) {
        return no('HIGH already has its source.');
    }
    return ok;
}

const sameEnd = (x: WireEnd, y: WireEnd) => x.node === y.node && x.port === y.port;

/** A new node id for a part: "resistor", then "resistor-2"... */
export function newNodeId(canvas: Canvas, part: string): string {
    const base = part === 'twist' ? 'board' : part;
    let id = base;
    for (let n = 2; canvas.nodes.some(x => x.id === id); n++) {
        id = `${base}-${n}`;
    }
    return id;
}

/** Adds a part when the rules allow it; returns the new canvas, or the reason it was refused. */
export function addPart(canvas: Canvas, part: string, x: number, y: number): { canvas: Canvas } | { reason: string } {
    const verdict = canAdd(canvas, part);
    if (!verdict.ok) {
        return { reason: verdict.reason };
    }
    const def = partDef(part)!;
    const node: CanvasNode = {
        id: newNodeId(canvas, part), part, x: Math.round(x), y: Math.round(y),
        values: Object.fromEntries(def.values.map(v => [v.key, v.default])),
    };
    return { canvas: { ...canvas, nodes: [...canvas.nodes, node] } };
}

/** The canvas of a new setup: the board alone (U5 writes `{id: board, part: twist}`). */
export function normaliseCanvas(raw: unknown): Canvas {
    const c = (raw ?? {}) as Partial<Canvas>;
    return { nodes: Array.isArray(c.nodes) ? c.nodes : [], wires: Array.isArray(c.wires) ? c.wires : [],
        ...(Array.isArray(c.probes) ? { probes: c.probes } : {}) };
}

/** The part wired to one of the board's ports, if any (the simulator follows the wires). */
export function wiredTo(canvas: Canvas, port: 'HIGH' | 'LOW1' | 'LOW2'): CanvasNode | undefined {
    for (const wire of canvas.wires) {
        for (const [board, other] of [[wire.from, wire.to], [wire.to, wire.from]]) {
            if (kindOf(canvas, board.node) === 'board' && board.port === port) {
                return canvas.nodes.find(n => n.id === other.node);
            }
        }
    }
    return undefined;
}

/**
 * F3 (Q173b): one sentence saying what the canvas lacks before it can be simulated, or undefined.
 * The same words as ownstudio_lab.plant_values.missing_for_simulation, which the runner enforces.
 */
export function simulationMissing(canvas: Canvas): string | undefined {
    const source = !!wiredTo(canvas, 'HIGH'), load = !!wiredTo(canvas, 'LOW1');
    if (source && load) {
        return undefined;
    }
    if (!source && !load) {
        return 'Add a source on HIGH and a load on LOW1 to simulate.';
    }
    return source ? 'Add a load on LOW1 to simulate.' : 'Add a source on HIGH to simulate.';
}

/**
 * F3 (Q173b): the bench's source and load, wired: the 30 V source on HIGH and a 33 Ω resistor on
 * LOW1 (their part defaults). Parts already there are wired rather than duplicated; what is
 * already wired is left alone. `spot` places a new part.
 */
export function withBenchSourceAndLoad(canvas: Canvas, spot: (part: string, canvas: Canvas) => { x: number; y: number }): Canvas {
    const board = canvas.nodes.find(n => partDef(n.part)?.kind === 'board');
    if (!board) {
        return canvas;
    }
    let next = canvas;
    for (const [port, part, partPort] of [['HIGH', 'dc-source', 'out'], ['LOW1', 'resistor', 'in']] as const) {
        if (wiredTo(next, port)) {
            continue;
        }
        const kind = partDef(part)!.kind;
        let node = next.nodes.find(n => partDef(n.part)?.kind === kind
            && !next.wires.some(w => w.from.node === n.id || w.to.node === n.id));
        if (!node) {
            const at = spot(part, next);
            const added = addPart(next, part, at.x, at.y);
            if ('reason' in added) {
                continue;       // a source wired elsewhere cannot happen: sources only take HIGH
            }
            next = added.canvas;
            node = next.nodes[next.nodes.length - 1];
        }
        const from = { node: node.id, port: partPort }, to = { node: board.id, port };
        if (canConnect(next, from, to).ok) {
            next = { ...next, wires: [...next.wires, { from, to }] };
        }
    }
    return next;
}
