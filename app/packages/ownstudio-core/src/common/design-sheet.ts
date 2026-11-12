// SPDX-License-Identifier: LGPL-2.1-only
// The Design workbench's sheets (plan U16, SPEC §6): live forms over the board's
// design scripts, which a setup keeps in ownstudio/design/. The scripts compute
// every number; this module only describes their JSON and the arguments sent.

export interface DesignSheetEntry { id: string; label: string }
export interface DesignSheets { directory: string; sheets: DesignSheetEntry[]; installed: boolean }

export interface SheetResult {
    id: string; title: string; value: number; unit: string; formula: string;
    setup: number | null; meets: boolean | null; note?: string;
}

export interface OutputFilterSheet {
    inputs: { v_in_V: number; v_out_V: number; load_ohm: number; f_sw_Hz: number; ripple_ratio: number;
        i_max_A: number; ripple_max_V: number; step_A: number };
    board: { inductance_H: number; capacitance_F: number };
    values: { inductance_H: number; capacitance_F: number; electrolytic_capacitance_F: number };
    curve: { inductance_H: number[]; ripple_V: number[] };
    results: SheetResult[];
}

export interface BodeCurve { mag_dB: number[]; phase_deg: number[] }
export interface ControlLoopSheet {
    inputs: { kp: number; ti_s: number; period_s: number; v_in_V: number; load_ohm: number;
        inductance_H: number; capacitance_F: number };
    resonance_Hz: number;
    f_Hz: number[];
    plant: BodeCurve; controller: BodeCurve; loop: BodeCurve;
    margins: { crossover_Hz: number | null; phase_margin_deg: number | null;
        phase_crossover_Hz: number | null; gain_margin_dB: number | null };
    gains_in_control_cpp: { kp: number; ti: number };
}

/** What the user is trying on the output filter sheet; L and C undefined = the canvas's. */
export interface FilterTrial { L?: number; C?: number; vOut: number; stepA: number; rippleMax: number }

export function filterArgs(t: FilterTrial): (string | number)[] {
    const args: (string | number)[] = ['--v-out', t.vOut, '--step', t.stepA, '--ripple-max', t.rippleMax];
    if (t.L !== undefined) {
        args.push('--L', t.L);
    }
    if (t.C !== undefined) {
        args.push('--C', t.C);
    }
    return args;
}

export function loopArgs(kp: number | undefined, ti: number | undefined, apply = false): (string | number)[] {
    const args: (string | number)[] = [];
    if (kp !== undefined) {
        args.push('--kp', kp);
    }
    if (ti !== undefined) {
        args.push('--ti', ti);
    }
    if (apply) {
        args.push('--apply');
    }
    return args;
}

/** True when the gains on the sheet differ from those written in control.cpp (relative 1e-6). */
export function gainsDiffer(sheet: { kp: number; ti: number }, file: { kp: number; ti: number }): boolean {
    const differ = (a: number, b: number) => Math.abs(a - b) > 1e-6 * Math.max(Math.abs(a), Math.abs(b));
    return differ(sheet.kp, file.kp) || differ(sheet.ti, file.ti);
}

/** A log slider position (0…1000) ↔ a value between lo and hi. */
export function toSlider(value: number, lo: number, hi: number): number {
    const clamped = Math.min(hi, Math.max(lo, value));
    return Math.round(1000 * Math.log(clamped / lo) / Math.log(hi / lo));
}
export function fromSlider(position: number, lo: number, hi: number): number {
    return Number((lo * (hi / lo) ** (position / 1000)).toPrecision(3));
}
