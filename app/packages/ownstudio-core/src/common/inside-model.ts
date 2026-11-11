// SPDX-License-Identifier: LGPL-2.1-only
// The Twist's inside view as UI-ready data (plan U9). Geometry and connections
// come from board.yaml; hardware values come from the setup Core's devicetree.
import { BoardDefinition, InsideBlockDescription } from './setup-protocol';

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
