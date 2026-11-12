// SPDX-License-Identifier: LGPL-2.1-only
// Waveforms filed with a test record (waveform.csv: t_s, v_low1_V, ...).

export interface WaveformSeries { name: string; values: number[]; }
export interface Waveform { t: number[]; v: number[]; series?: WaveformSeries[]; }

/** The first two columns of waveform.csv, keeping about `points` samples. */
export function parseWaveform(text: string, points = 1500): Waveform {
    const all = text.trim().split('\n');
    const names = (all[0] ?? '').split(',').slice(1).map(name => name.trim());
    const lines = all.slice(1);
    const step = Math.max(1, Math.floor(lines.length / points));
    const t: number[] = [];
    const values = names.map(() => [] as number[]);
    for (let i = 0; i < lines.length; i += step) {
        const row = lines[i].split(',').map(Number);
        if (Number.isFinite(row[0]) && Number.isFinite(row[1])) {
            t.push(row[0]);
            values.forEach((channel, index) => channel.push(Number.isFinite(row[index + 1]) ? row[index + 1] : NaN));
        }
    }
    return { t, v: values[0] ?? [], series: names.map((name, index) => ({ name, values: values[index] })) };
}

/** Initial result viewport: the event is large, with the complete run available separately. */
export function eventWindow(t: number[]): [number, number] {
    if (t.length < 2) {
        return [0, 1];
    }
    const full: [number, number] = [t[0], t[t.length - 1]];
    if (full[0] >= 0 || full[1] <= 0) {
        return full;
    }
    return [Math.max(full[0], -0.005), Math.min(full[1], 0.04)];
}
