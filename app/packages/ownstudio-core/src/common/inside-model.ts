// SPDX-License-Identifier: LGPL-2.1-only
// The Twist's inside view as UI-ready data (plan U9). Geometry and connections
// come from board.yaml; hardware values come from the setup Core's devicetree.
import { BoardDefinition, InsideBlockDescription } from './setup-protocol.js';

export const INSIDE_BLOCKS = ['power', 'measurement', 'feeder', 'driver', 'controller'] as const;
export type InsideBlockId = typeof INSIDE_BLOCKS[number];

export interface InsideBlock extends InsideBlockDescription {
    id: InsideBlockId;
    details: [string, string][];
}

export interface InsideModel {
    boardLabel: string;
    blocks: InsideBlock[];
    signals: [InsideBlockId, InsideBlockId, string][];
    ports: string[];
    isolation: boolean;
}

const frequency = (hz: number): string => hz % 1000 === 0 ? `${hz / 1000} kHz` : `${hz} Hz`;
const sourceName = (path: string): string => path.split('/').pop() ?? path;
const modulation = (value: string): string => value.replace(/UpDwn/i, 'up-down').replace(/_/g, ' ').toLowerCase();

function details(id: InsideBlockId, board: BoardDefinition): [string, string][] {
    const legs = board.legs.filter(leg => leg.enabled);
    const first = legs[0];
    const source = sourceName(board.overlay);
    const pwmDevices = [...new Set(legs.flatMap(leg => leg.pwm_devices))];
    const timer = pwmDevices.length && pwmDevices.every(device => /^pwm[a-f]$/i.test(device)) ? 'HRTIM' : pwmDevices.join(' · ') || '—';
    switch (id) {
        case 'power': return [
            ['Function', 'power conversion, both legs'],
            ['Legs', legs.map(leg => leg.name).join(' · ')],
            ['Switching frequency', frequency(board.default_frequency_hz)],
            ['Ports', Object.keys(board.description.ports).join(' · ')],
            ['Source', source],
        ];
        case 'measurement': return [
            ['Function', 'signal conditioning'],
            ['Sensors', String(board.sensors.filter(sensor => sensor.enabled).length)],
            ['ADCs', [...new Set(board.sensors.map(sensor => sensor.adc).filter(Boolean))].join(' · ')],
            ['Calibration', 'gain and offset from devicetree'],
            ['Source', source],
        ];
        case 'feeder': return [
            ['Function', 'auxiliary power supply'],
            ['Placement', 'between power and control'],
            ['Source', 'board.yaml'],
        ];
        case 'driver': return [
            ['Function', 'gate drivers, both legs'],
            ['Timer', timer],
            ['Switching frequency', frequency(board.default_frequency_hz)],
            ['Dead time', first ? first.dead_time_ns.map(ns => `${ns} ns`).join(' / ') : '—'],
            ['Modulation', first ? modulation(first.modulation) : '—'],
            ['Set in', 'setup() · main.cpp:42'],
            ['Source', source],
        ];
        case 'controller': return [
            ['Function', 'control and PWM generation'],
            ['Controller', board.description.controller],
            ['PWM pins', legs.flatMap(leg => leg.pwm_pins).join(' · ')],
            ['Code', 'main.cpp · control.cpp'],
            ['Source', 'spin_header.dtsi'],
        ];
    }
}

/** Rejects unknown block references: a board description must draw one coherent five-block converter. */
export function insideModel(board: BoardDefinition): InsideModel {
    const raw = board.description.inside;
    const blocks = INSIDE_BLOCKS.map(id => {
        const block = raw.blocks[id];
        if (!block) {
            throw new Error(`The board description has no ${id} block.`);
        }
        return { id, ...block, details: details(id, board) };
    });
    const known = new Set<string>(INSIDE_BLOCKS);
    const signals = raw.signals.map(([from, to, label]) => {
        if (!known.has(from) || !known.has(to)) {
            throw new Error(`The board description connects an unknown block: ${from} → ${to}.`);
        }
        return [from as InsideBlockId, to as InsideBlockId, label] as [InsideBlockId, InsideBlockId, string];
    });
    return {
        boardLabel: board.description.label,
        blocks,
        signals,
        ports: Object.keys(board.description.ports),
        isolation: raw.isolation,
    };
}

/**
 * F10 (Q182): the inside view on a fixed grid. Blocks, arrows and the two sides share one
 * coordinate system (INSIDE_VIEW, scaled uniformly), and every arrow is drawn from block edges,
 * so lines meet blocks at any panel size. The grid follows board.yaml's `at`: column 0 and 1,
 * row 0 and 1, the feeder at the centre (0.5, 0.5).
 */
export const INSIDE_VIEW = { width: 960, height: 300 };
export const INSIDE_GRID = { left: 120, columnStep: 500, top: 70, rowStep: 160, blockWidth: 220, blockHeight: 44 };

export interface Rect { x: number; y: number; width: number; height: number }
export interface InsideArrow { from: InsideBlockId; to: InsideBlockId; points: [number, number][]; label?: string; labelAt?: [number, number] }
export interface InsideLayout {
    blocks: (Rect & { id: InsideBlockId })[];
    signals: InsideArrow[];
    energy: InsideArrow[];
    sides: { power: Rect; control: Rect };
    barrier?: [number, number, number, number];
}

const blockRect = (at: [number, number]): Rect => ({
    x: INSIDE_GRID.left + at[0] * INSIDE_GRID.columnStep, y: INSIDE_GRID.top + at[1] * INSIDE_GRID.rowStep,
    width: INSIDE_GRID.blockWidth, height: INSIDE_GRID.blockHeight,
});

/** The straight, axis-aligned path between two blocks' facing edges, through their overlap. */
function between(a: Rect, b: Rect): [number, number][] {
    const overlapY = [Math.max(a.y, b.y), Math.min(a.y + a.height, b.y + b.height)];
    if (overlapY[0] < overlapY[1]) {            // side by side: a horizontal line
        const y = (overlapY[0] + overlapY[1]) / 2;
        return a.x < b.x ? [[a.x + a.width, y], [b.x, y]] : [[a.x, y], [b.x + b.width, y]];
    }
    const x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;     // stacked: a vertical one
    return a.y < b.y ? [[x, a.y + a.height], [x, b.y]] : [[x, a.y], [x, b.y + b.height]];
}

export function insideLayout(model: InsideModel): InsideLayout {
    const rects = new Map(model.blocks.map(block => [block.id, blockRect(block.at as [number, number])]));
    const rect = (id: InsideBlockId): Rect => rects.get(id)!;
    const signals = model.signals.map(([from, to, label]): InsideArrow => {
        const points = between(rect(from), rect(to));
        const [[x0, y0], [, y1]] = points;
        // Labels start just right of their line, or of the isolation barrier for one that crosses it.
        const labelAt: [number, number] = y0 === y1 ? [INSIDE_VIEW.width / 2 + 8, y0 - 8] : [x0 + 10, (y0 + y1) / 2 + 4];
        return { from, to, points, label, labelAt };
    });
    // The feeder supplies the four others: from its left and right edges, out and up or down to
    // each block's facing edge, clear of the signal arrows (a quarter of the way along the block).
    const feeder = rect('feeder');
    const energy = (['power', 'driver', 'measurement', 'controller'] as InsideBlockId[]).map((to): InsideArrow => {
        const target = rect(to);
        const left = target.x + target.width <= feeder.x;
        const startX = left ? feeder.x : feeder.x + feeder.width;
        const startY = feeder.y + feeder.height * (target.y < feeder.y ? 0.3 : 0.7);
        const x = left ? target.x + target.width * 0.75 : target.x + target.width * 0.25;
        const endY = target.y < feeder.y ? target.y + target.height : target.y;
        return { from: 'feeder', to, points: [[startX, startY], [x, startY], [x, endY]] };
    });
    const top = 36;
    const bottom = INSIDE_VIEW.height - 8;
    const middle = INSIDE_VIEW.width / 2;
    return {
        blocks: model.blocks.map(block => ({ id: block.id, ...rect(block.id) })),
        signals, energy,
        sides: {
            power: { x: 40, y: top, width: middle - 60, height: bottom - top },
            control: { x: middle + 20, y: top, width: middle - 60, height: bottom - top },
        },
        barrier: model.isolation ? [middle, top, middle, bottom] : undefined,
    };
}
