// SPDX-License-Identifier: LGPL-2.1-only
// The six continuous Lab checks of SPEC §9. This file is deliberately pure:
// the browser model supplies the canvas, board and live ThingSet values, while
// tests can exercise every unsafe bench state without a board.
import { FirmwareState } from './board-protocol.js';
import { Canvas, partDef } from './canvas-model.js';

export type LabCheckId = 'board' | 'firmware' | 'high' | 'outputs' | 'load' | 'procedure';

export interface LabCheck {
    id: LabCheckId;
    label: string;
    ok: boolean;
    /** One sentence shown beside a red Run button or a checklist line. */
    sentence: string;
}

export interface LivePort {
    voltage?: number;
    current?: number;
    voltageMax?: number;
    currentMax?: number;
}

export interface LabChecklistInput {
    canvas: Canvas;
    boardProduct?: string;
    firmware: FirmwareState;
    firmwareHash?: string;
    highVoltage?: number;
    outputs: Partial<Record<'LOW1' | 'LOW2', LivePort>>;
    procedure?: { title: string; valid: boolean };
}

const pass = (id: LabCheckId, label: string, sentence: string): LabCheck => ({ id, label, ok: true, sentence });
const fail = (id: LabCheckId, label: string, sentence: string): LabCheck => ({ id, label, ok: false, sentence });
const number = (value: number, digits = 1): string => value.toFixed(digits).replace(/\.0$/, '');

const wireAt = (canvas: Canvas, node: string, port: string) => canvas.wires.find(w =>
    (w.from.node === node && w.from.port === port) || (w.to.node === node && w.to.port === port));

const otherEnd = (wire: Canvas['wires'][number], node: string) => wire.from.node === node ? wire.to : wire.from;

/** Build the checklist in the exact order fixed by SPEC §9. */
export function labChecklist(input: LabChecklistInput): LabCheck[] {
    const boardNode = input.canvas.nodes.find(node => partDef(node.part)?.kind === 'board');
    const expectedBoard = boardNode?.part === 'twist' ? 'Twist 1.4.2' : 'the board on the canvas';
    let board: LabCheck;
    if (!boardNode) {
        board = fail('board', 'Board', 'Place a board on the canvas.');
    } else if (!input.boardProduct) {
        board = fail('board', 'Board', `Connect ${expectedBoard}, as shown on the canvas.`);
    } else if (boardNode.part === 'twist' && input.boardProduct !== 'TWIST_V1_4_2') {
        board = fail('board', 'Board', /^TWIST_V\d+_\d+_\d+$/.test(input.boardProduct)
            ? `A different Twist revision is connected; the canvas needs ${expectedBoard}.`
            : `A bare Spin is connected; the canvas needs ${expectedBoard}.`);
    } else {
        board = pass('board', 'Board', `${expectedBoard}, as on the canvas.`);
    }

    const hash = input.firmwareHash?.slice(0, 8);
    const firmware = input.firmware === 'matches'
        ? pass('firmware', 'Firmware', `Runs this setup${hash ? ` (${hash})` : ''}.`)
        : fail('firmware', 'Firmware', input.firmware === 'prebuilt'
            ? 'The setup changed after this firmware was built; build and upload it again.'
            : input.firmware === 'differs'
                ? 'The board runs different firmware; upload this setup.'
                : 'The board does not report this setup’s build identity.');

    let high: LabCheck;
    const highWire = boardNode && wireAt(input.canvas, boardNode.id, 'HIGH');
    const source = highWire && boardNode ? input.canvas.nodes.find(node => node.id === otherEnd(highWire, boardNode.id).node) : undefined;
    const expectedHigh = source?.values?.voltage;
    if (!source || partDef(source.part)?.kind !== 'source' || typeof expectedHigh !== 'number' || expectedHigh <= 0) {
        high = fail('high', 'HIGH', 'Connect a configured DC source to HIGH.');
    } else if (typeof input.highVoltage !== 'number' || !Number.isFinite(input.highVoltage)) {
        high = fail('high', 'HIGH', 'HIGH has no live voltage reading.');
    } else {
        const error = Math.abs(input.highVoltage - expectedHigh) / expectedHigh;
        if (error <= 0.1) {
            high = pass('high', 'HIGH', `${number(input.highVoltage)} V measured, canvas ${number(expectedHigh)} V (within 10 %).`);
        } else if (input.highVoltage <= Math.max(1, expectedHigh * 0.1)) {
            high = fail('high', 'HIGH', `HIGH is ${number(input.highVoltage)} V; the canvas says ${number(expectedHigh)} V. Switch the supply on.`);
        } else {
            const direction = input.highVoltage < expectedHigh ? 'low' : 'high';
            high = fail('high', 'HIGH', `HIGH is ${number(input.highVoltage)} V; the canvas says ${number(expectedHigh)} V `
                + `(${number(error * 100)} % ${direction}; it must be within 10 %).`);
        }
    }

    const loadedPorts = (['LOW1', 'LOW2'] as const).filter(port => !!boardNode && !!wireAt(input.canvas, boardNode.id, port));
    const unsafe: string[] = [];
    const summaries: string[] = [];
    for (const port of loadedPorts) {
        const live = input.outputs[port];
        if (!live || typeof live.voltage !== 'number') {
            unsafe.push(`${port} has no live voltage reading`);
            continue;
        }
        if (live.voltageMax === undefined || live.currentMax === undefined) {
            unsafe.push(`${port} has no operating limits`);
        }
        if (live.currentMax !== undefined && typeof live.current !== 'number') {
            unsafe.push(`${port} has no live current reading`);
        }
        if (live.voltageMax !== undefined && Math.abs(live.voltage) > live.voltageMax) {
            unsafe.push(`${port} is ${number(live.voltage)} V, above ${number(live.voltageMax)} V`);
        }
        if (live.current !== undefined && live.currentMax !== undefined && Math.abs(live.current) > live.currentMax) {
            unsafe.push(`${port} is ${number(live.current)} A, above ${number(live.currentMax)} A`);
        }
        const limits = [live.voltageMax !== undefined ? `${number(live.voltageMax)} V` : '',
            live.currentMax !== undefined ? `${number(live.currentMax)} A` : ''].filter(Boolean).join(' / ');
        summaries.push(`${port} ${number(live.voltage)} V${limits ? `, inside ${limits}` : ''}`);
    }
    const outputs = unsafe.length
        ? fail('outputs', 'Outputs', `${unsafe.join('; ')}.`)
        : pass('outputs', 'Outputs', summaries.length ? `${summaries.join('; ')}.` : 'No output is wired; inside the limits.');

    const loads: string[] = [];
    for (const port of loadedPorts) {
        const wire = boardNode && wireAt(input.canvas, boardNode.id, port);
        const node = wire && boardNode ? input.canvas.nodes.find(n => n.id === otherEnd(wire, boardNode.id).node) : undefined;
        const ohm = node?.values?.ohm;
        if (node && partDef(node.part)?.kind === 'load' && typeof ohm === 'number' && ohm > 0) {
            loads.push(`${number(ohm)} Ω on ${port}`);
        }
    }
    const load = loads.length
        ? pass('load', 'Load', `${loads.join('; ')}.`)
        : fail('load', 'Load', 'Set and connect a load on LOW1 or LOW2.');

    const procedure = input.procedure?.valid
        ? pass('procedure', 'Procedure', `${input.procedure.title} · ready.`)
        : fail('procedure', 'Procedure', 'Choose a valid procedure that runs on the board.');

    return [board, firmware, high, outputs, load, procedure];
}

export function firstFailed(checks: LabCheck[]): LabCheck | undefined {
    return checks.find(check => !check.ok);
}
