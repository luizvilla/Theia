// SPDX-License-Identifier: LGPL-2.1-only
// Engineering notation for values shown on the canvas, the inspector and the design sheets.

const PREFIXES: [number, string][] = [[1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M']];

/** 3.3e-5 H → "33 µH"; 30 V → "30 V". */
export function eng(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
        return `— ${unit}`.trim();
    }
    if (value === 0) {
        return `0 ${unit}`.trim();
    }
    for (const [factor, prefix] of PREFIXES) {
        if (Math.abs(value) < factor * 1000) {
            return `${Number((value / factor).toPrecision(3))} ${prefix}${unit}`.trim();
        }
    }
    return `${value.toPrecision(3)} ${unit}`.trim();
}

/** "47u", "47 µ", "47e-6", "0.000047" → 4.7e-5; undefined when it is not a number. */
export function parseEng(text: string): number | undefined {
    const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([nuµmkM]?)\s*[A-Za-zΩ]*\s*$/.exec(text);
    if (!match) {
        return undefined;
    }
    const scale: Record<string, number> = { '': 1, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6 };
    const value = Number(match[1]) * scale[match[2]];
    return Number.isFinite(value) ? value : undefined;
}
