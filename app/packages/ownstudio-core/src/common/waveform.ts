// SPDX-License-Identifier: LGPL-2.1-only
// Waveforms filed with a test record (waveform.csv: t_s, v_low1_V, ...).

export interface Waveform { t: number[]; v: number[]; }

/** The first two columns of waveform.csv, keeping about `points` samples. */
export function parseWaveform(text: string, points = 1500): Waveform {
    const lines = text.trim().split('\n').slice(1);
    const step = Math.max(1, Math.floor(lines.length / points));
    const t: number[] = [];
    const v: number[] = [];
    for (let i = 0; i < lines.length; i += step) {
        const [a, b] = lines[i].split(',').map(Number);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            t.push(a);
            v.push(b);
        }
    }
    return { t, v };
}
