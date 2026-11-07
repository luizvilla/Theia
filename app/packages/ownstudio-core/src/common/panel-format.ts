// SPDX-License-Identifier: LGPL-2.1-only
// Lab panels (ADR 0024): OwnStudio's own widgets, read from the subset of
// modular's dashboard JSON that maps onto them. Only ThingSet data sources
// are read; anything else becomes an "unsupported" widget that says why.

export interface Gauge { kind: 'gauge'; title: string; path: string; min: number; max: number; units: string; critical?: number; }
export interface NumberDisplay { kind: 'number'; title: string; path: string; units: string; }
export interface Setpoint { kind: 'setpoint'; title: string; path: string; writePath: string; step: number; units: string; }
export interface Toggle { kind: 'toggle'; title: string; path: string; writePath: string; on: number | boolean; off: number | boolean; }
export interface Plot { kind: 'plot'; title: string; durationMs: number; yMin?: number; yMax?: number; yLabel: string; series: { label: string; path: string }[]; }
export interface Unsupported { kind: 'unsupported'; title: string; type: string; reason: string; }
export type PanelWidget = Gauge | NumberDisplay | Setpoint | Toggle | Plot | Unsupported;

export interface Panel { panes: { title: string; widgets: PanelWidget[] }[]; }

const GAUGES = ['radial_arc_gauge', 'radial_needle_gauge', 'donut_gauge', 'vertical_gauge'];
const THINGSET = 'owntech_thingset_datasource';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** "/Converter/Mode" -> "Converter/Mode" */
export function normalizePath(path: string): string {
    return String(path).replace(/^\/+/, '');
}

/** "Converter/wVoltageRef_V" -> ["Converter", "wVoltageRef_V"] */
export function splitPath(path: string): [string, string] {
    const i = path.lastIndexOf('/');
    return i < 0 ? ['', path] : [path.slice(0, i), path.slice(i + 1)];
}

function source(def: Raw, datasources: Map<string, string>): string | undefined {
    if (!def || def.var === undefined || def.var === null) {
        return undefined;
    }
    const type = def.type ?? datasources.get(def.ds);
    return type === THINGSET && typeof def.var === 'string' ? normalizePath(def.var) : undefined;
}

function widget(w: Raw, datasources: Map<string, string>): PanelWidget {
    const s = w.settings ?? {};
    const title = String(s.title ?? w.type);
    const unsupported = (reason: string): Unsupported => ({ kind: 'unsupported', title, type: w.type, reason });
    const path = source(s.sourceDef, datasources);
    if (GAUGES.includes(w.type)) {
        return path ? { kind: 'gauge', title, path, min: Number(s.min ?? 0), max: Number(s.max ?? 100), units: s.units ?? '',
            critical: s.alarmEnabled && s.alarmDirection !== 'below' && s.criticalThreshold !== undefined ? Number(s.criticalThreshold) : undefined }
            : unsupported('needs a ThingSet source');
    }
    switch (w.type) {
        case 'text_widget':
            return path ? { kind: 'number', title, path, units: s.units ?? '' } : unsupported('needs a ThingSet source (sourceDef)');
        case 'plus_minus_button':
            return path && s.writePath ? { kind: 'setpoint', title, path, writePath: normalizePath(s.writePath), step: Number(s.step ?? 1), units: s.units ?? '' }
                : unsupported('needs a ThingSet source and a writePath');
        case 'toggle_button':
            return s.writePath ? { kind: 'toggle', title, path: path ?? normalizePath(s.writePath), writePath: normalizePath(s.writePath),
                on: s.onValue ?? true, off: s.offValue ?? false } : unsupported('needs a writePath (serial commands are not supported)');
        case 'time_plot_uplot': {
            const series = (s.seriesDefs ?? []).map((d: Raw) => ({ label: String(d.label ?? ''), path: d.op && d.op !== 'identity' ? undefined : source(d.a, datasources) }));
            if (!series.length || series.some((x: { path?: string }) => !x.path)) {
                return unsupported('every series must be a ThingSet value with the identity operation');
            }
            return { kind: 'plot', title, durationMs: Number(s.duration ?? 10000), yMin: s.yMin, yMax: s.yMax, yLabel: s.yLabel ?? '', series };
        }
        default:
            return unsupported('not one of the widgets OwnStudio reads');
    }
}

export function parsePanel(text: string): Panel {
    const raw: Raw = JSON.parse(text);
    if (!raw || !Array.isArray(raw.panes)) {
        throw new Error("not a dashboard: no 'panes' list");
    }
    const datasources = new Map<string, string>((raw.datasources ?? []).map((d: Raw) => [d.name, d.type]));
    return {
        panes: raw.panes.map((p: Raw) => ({
            title: String(p.title ?? ''),
            widgets: (p.widgets ?? []).map((w: Raw) => widget(w, datasources)),
        })),
    };
}

/** Every ThingSet path a panel reads. */
export function panelPaths(panel: Panel): string[] {
    const paths = new Set<string>();
    for (const pane of panel.panes) {
        for (const w of pane.widgets) {
            if (w.kind === 'plot') {
                w.series.forEach(s => paths.add(s.path));
            } else if (w.kind !== 'unsupported') {
                paths.add(w.path);
            }
        }
    }
    return [...paths];
}
