// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { WORKBENCHES, widgetId } from './workbenches.js';
import { SetupService } from '../common/setup-protocol.js';
import {
    BodeCurve, ControlLoopSheet, FilterTrial, OutputFilterSheet, SheetResult,
    filterArgs, fromSlider, gainsDiffer, loopArgs, toSlider
} from '../common/design-sheet.js';
import { eng, parseEng } from '../common/units.js';
import { DesignModel } from './design-model.js';
import { CanvasWidget } from './canvas-widget.js';

export { eng } from '../common/units.js';

const CURVES: { key: 'plant' | 'controller' | 'loop'; label: string; color: string }[] = [
    { key: 'plant', label: 'Plant G', color: '#6C8AFF' },
    { key: 'controller', label: 'PI C', color: '#B6C9F8' },
    { key: 'loop', label: 'Loop L = C·G', color: '#F9F77F' },
];

/** Slider ranges: wide enough for a student's what-if, log-scaled. */
const RANGE = {
    L: [10e-6, 150e-6], C: [4.7e-6, 100e-6], kp: [1e-5, 1e-2], ti: [1e-6, 1e-2],
} as const;

const LIVE_MS = 60;

/**
 * The Design workbench (SPEC §6, frame 13): live sheets over the setup's own
 * ownstudio/design/*.py. Python computes every number; this view draws them.
 * L and C are the Twist's values on the canvas, so the plant follows; "Apply to
 * the code" writes Kp and Ti into src/control.cpp. Each change is a `design` dot.
 */
@injectable()
export class DesignWidget extends ReactWidget {

    @inject(DesignModel) protected readonly model: DesignModel;
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(CanvasWidget) protected readonly canvas: CanvasWidget;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected filter: OutputFilterSheet | undefined;
    protected trial: FilterTrial = { vOut: 12, stepA: 0.5, rippleMax: 0.1 };
    protected loop: ControlLoopSheet | undefined;
    protected kp: number | undefined;
    protected ti: number | undefined;
    protected problem: string | undefined;
    protected busy = false;
    protected timer: ReturnType<typeof setTimeout> | undefined;
    /** Answers can come back out of order; only the latest request's answer is drawn. */
    protected request = 0;
    /** What the fields show while the user types; cleared when the value is taken. */
    protected drafts: Record<string, string> = {};

    @postConstruct()
    protected init(): void {
        const design = WORKBENCHES.find(w => w.id === 'design')!;
        this.id = widgetId(design);
        this.title.label = design.label;
        this.title.caption = design.purpose;
        this.title.iconClass = design.iconClass;
        this.title.closable = false;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-design');
        this.node.tabIndex = 0;
        this.model.onDidChange(() => this.schedule(0));
        // The canvas (a PulsimGui save, a restore, another sheet) may change L, C, the source or the load.
        this.canvas.onDidChange(() => this.isVisible && this.schedule(LIVE_MS));
        void this.model.ready();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        void this.model.ready().then(() => this.schedule(0));
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected schedule(delay: number): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.refresh(); }, delay);
    }

    protected async refresh(): Promise<void> {
        const folder = this.model.folder;
        const sheet = this.model.selected;
        if (!folder || !sheet) {
            this.update();
            return;
        }
        const request = ++this.request;
        this.busy = true;
        this.update();
        try {
            if (sheet === 'output_filter') {
                const result = await this.setups.runDesignSheet(folder, sheet, filterArgs(this.trial)) as OutputFilterSheet;
                if (request === this.request) {
                    this.filter = result;
                }
            } else if (sheet === 'control_loop') {
                const result = await this.setups.runDesignSheet(folder, sheet, loopArgs(this.kp, this.ti)) as ControlLoopSheet;
                if (request === this.request) {
                    this.loop = result;
                    this.kp ??= result.gains_in_control_cpp.kp;
                    this.ti ??= result.gains_in_control_cpp.ti;
                }
            }
            if (request === this.request) {
                this.problem = undefined;
            }
        } catch (error) {
            if (request === this.request) {
                this.problem = error instanceof Error ? error.message : String(error);
            }
        }
        if (request === this.request) {
            this.busy = false;
            this.node.dataset.request = String(request);
            this.update();
        }
    }

    // --- output filter -------------------------------------------------------

    /** L or C on the canvas: saved, committed as a design dot, then the sheet rereads the setup. */
    protected async takeValue(which: 'L' | 'C', value: number): Promise<void> {
        const key = which === 'L' ? 'inductance_H' : 'capacitance_F';
        const unit = which === 'L' ? 'H' : 'F';
        this.trial = { ...this.trial, [which]: value };
        try {
            await this.canvas.setBoardValues({ [key]: value }, `${which} ${eng(value, unit)}`);
            this.trial = { ...this.trial, [which]: undefined };
        } catch (error) {
            this.messages.error(`${which} not changed: ${error instanceof Error ? error.message : error}`);
        }
        this.schedule(0);
    }

    protected tryValue(which: 'L' | 'C', value: number): void {
        this.trial = { ...this.trial, [which]: value };
        this.update();
        this.schedule(LIVE_MS);
    }

    protected openScript(sheet: string): void {
        if (this.model.folder) {
            open(this.opener, new URI(`file://${this.model.folder}/ownstudio/design/${sheet}.py`));
        }
    }

    // --- control loop --------------------------------------------------------

    protected async applyGains(): Promise<void> {
        const folder = this.model.folder;
        if (!folder || this.kp === undefined || this.ti === undefined) {
            return;
        }
        try {
            this.loop = await this.setups.runDesignSheet(folder, 'control_loop', loopArgs(this.kp, this.ti, true)) as ControlLoopSheet;
            await this.setups.commitEvent(folder, 'design', `design: Kp ${this.kp}, Ti ${this.ti} s in control.cpp`);
            this.messages.info(`src/control.cpp now has Kp = ${this.kp} and Ti = ${this.ti} s. Build and run to see what it does.`);
        } catch (error) {
            this.messages.error(`The gains were not written: ${error instanceof Error ? error.message : error}`);
        }
        this.update();
    }

    // --- rendering -----------------------------------------------------------

    protected render(): React.ReactNode {
        const design = WORKBENCHES.find(w => w.id === 'design')!;
        const sheet = this.model.sheets.find(s => s.id === this.model.selected);
        if (!this.model.folder || !sheet) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>{design.label}</h1>
                <p className='ownstudio-workbench-purpose'>{this.model.problem
                    ?? (this.model.folder ? 'This board has no design sheets.' : 'Open a setup to use its design sheets.')}</p>
            </div>;
        }
        return <div className='ownstudio-workbench-body' data-sheet={sheet.id} data-busy={this.busy}>
            <div className='ownstudio-sheet-head'>
                <h1 className='ownstudio-title'>{sheet.label}</h1>
                <a href='#' className='ownstudio-sheet-formulas' onClick={e => { e.preventDefault(); this.openScript(sheet.id); }}>
                    <span className={codicon('symbol-function')} /> Show the formulas</a>
            </div>
            {this.problem && <p className='ownstudio-problem'>{this.problem}</p>}
            {sheet.id === 'output_filter' && this.renderFilter()}
            {sheet.id === 'control_loop' && this.renderLoop()}
        </div>;
    }

    /** A labelled value: a log slider plus a field that takes engineering notation. */
    protected renderSlider(id: string, label: string, unit: string, value: number, range: readonly [number, number],
        marker: number | undefined, onTry: (v: number) => void, onTake: (v: number) => void): React.ReactNode {
        const take = (text: string) => {
            const parsed = parseEng(text);
            delete this.drafts[id];
            if (parsed !== undefined && parsed > 0) {
                onTake(parsed);
            } else {
                this.update();
            }
        };
        const fromEvent = (e: { currentTarget: HTMLInputElement }) => fromSlider(Number(e.currentTarget.value), range[0], range[1]);
        return <div className='ownstudio-sheet-slider' key={id} data-field={id}>
            <label>
                <span>{label}</span>
                <input className='theia-input ownstudio-number' aria-label={label}
                    value={this.drafts[id] ?? eng(value, unit)}
                    onChange={e => { this.drafts[id] = e.currentTarget.value; this.update(); }}
                    onBlur={e => id in this.drafts && take(e.currentTarget.value)}
                    onKeyDown={e => e.key === 'Enter' && take(e.currentTarget.value)} />
            </label>
            <div className='ownstudio-sheet-range'>
                <input type='range' min={0} max={1000} value={toSlider(value, range[0], range[1])} aria-label={`${label} slider`}
                    onChange={e => onTry(fromEvent(e))}
                    onPointerUp={e => onTake(fromEvent(e))}
                    onKeyUp={e => onTake(fromEvent(e))} />
                {marker !== undefined && <i className='ownstudio-sheet-marker' title={`Twist: ${eng(marker, unit)}`}
                    style={{ left: `${toSlider(marker, range[0], range[1]) / 10}%` }} />}
            </div>
        </div>;
    }

    protected renderField(id: string, label: string, unit: string, value: number, onTake: (v: number) => void): React.ReactNode {
        const take = (text: string) => {
            const parsed = parseEng(text);
            delete this.drafts[id];
            if (parsed !== undefined && parsed > 0) {
                onTake(parsed);
            }
            this.update();
        };
        return <label className='ownstudio-sheet-field' key={id} data-field={id}>
            <span>{label}</span>
            <input className='theia-input ownstudio-number' aria-label={label} value={this.drafts[id] ?? eng(value, unit)}
                onChange={e => { this.drafts[id] = e.currentTarget.value; this.update(); }}
                onBlur={e => id in this.drafts && take(e.currentTarget.value)}
                onKeyDown={e => e.key === 'Enter' && take(e.currentTarget.value)} />
        </label>;
    }

    protected verdict(r: SheetResult | undefined, limit: string): React.ReactNode {
        if (!r) {
            return undefined;
        }
        return <div className={`ownstudio-sheet-verdict ${r.meets === false ? 'os-test-fail' : 'os-test-pass'}`} data-result={r.id}>
            <span>Ripple</span><b>{eng(r.value, r.unit)} {r.meets === false ? '>' : '≤'} {limit} {r.meets === false ? '✗' : '✓'}</b>
        </div>;
    }

    protected renderFilter(): React.ReactNode {
        const f = this.filter;
        if (!f) {
            return <p className='ownstudio-muted'>Calculating…</p>;
        }
        const L = this.trial.L ?? f.values.inductance_H;
        const C = this.trial.C ?? f.values.capacitance_F;
        const result = (id: string) => f.results.find(r => r.id === id);
        return <>
            <div className='ownstudio-sheet-grid'>
                <div className='ownstudio-sheet-controls'>
                    {this.renderSlider('L', 'L per leg', 'H', L, RANGE.L, f.board.inductance_H, v => this.tryValue('L', v), v => this.takeValue('L', v))}
                    {this.renderSlider('C', 'C per leg (ceramics)', 'F', C, RANGE.C, f.board.capacitance_F, v => this.tryValue('C', v), v => this.takeValue('C', v))}
                    <div className='ownstudio-sheet-fixed'><span>f_sw</span><b>{eng(f.inputs.f_sw_Hz, 'Hz')}</b>
                        <small>from the plant; editable with the devicetree in slice 2</small></div>
                    <div className='ownstudio-sheet-fixed'><span>V_in · load</span><b>{eng(f.inputs.v_in_V, 'V')} · {eng(f.inputs.load_ohm, 'Ω')}</b>
                        <small>from the canvas</small></div>
                    {this.renderField('vout', 'V_out', 'V', this.trial.vOut, v => { this.trial = { ...this.trial, vOut: v }; this.schedule(0); })}
                    {this.renderField('step', 'Load step', 'A', this.trial.stepA, v => { this.trial = { ...this.trial, stepA: v }; this.schedule(0); })}
                    {this.renderField('ripplemax', 'Ripple limit', 'V', this.trial.rippleMax, v => { this.trial = { ...this.trial, rippleMax: v }; this.schedule(0); })}
                    {this.verdict(result('ripple_v'), eng(f.inputs.ripple_max_V, 'V'))}
                </div>
                {this.renderRippleCurve(f, L)}
            </div>
            <table className='ownstudio-table ownstudio-design-table'>
                <thead><tr><th>What</th><th>Result</th><th>Formula</th><th>Setup</th><th></th></tr></thead>
                <tbody>{f.results.map(r => <tr key={r.id} data-result={r.id}>
                    <td>{r.title}{r.note && <div className='ownstudio-muted'>{r.note}</div>}</td>
                    <td className='ownstudio-design-value'>{eng(r.value, r.unit)}</td>
                    <td><code>{r.formula}</code></td>
                    <td>{r.setup === null ? '' : eng(r.setup, r.unit)}</td>
                    <td className={r.meets === null ? '' : r.meets ? 'os-test-pass' : 'os-test-fail'}>
                        {r.meets === null ? '' : r.meets ? '✓' : '✗'}</td>
                </tr>)}</tbody>
            </table>
            <p className='ownstudio-muted'>Moving a slider tries a value; releasing it puts it on the Twist on the canvas, where the plant
                and the simulation read it, and adds a design dot to the timeline.</p>
        </>;
    }

    protected renderRippleCurve(f: OutputFilterSheet, L: number): React.ReactNode {
        const W = 420, H = 230, left = 46, right = 12, top = 22, bottom = 28;
        const xs = f.curve.inductance_H, ys = f.curve.ripple_V;
        const limit = f.inputs.ripple_max_V;
        const yMax = Math.max(limit * 1.6, ...ys.filter((_, i) => xs[i] >= 20e-6));
        const x = (h: number) => left + Math.log(Math.min(Math.max(h, xs[0]), xs[xs.length - 1]) / xs[0])
            / Math.log(xs[xs.length - 1] / xs[0]) * (W - left - right);
        const y = (v: number) => top + (1 - Math.min(v, yMax) / yMax) * (H - top - bottom);
        const now = f.results.find(r => r.id === 'ripple_v')!.value;
        const ticks = [10e-6, 20e-6, 50e-6, 100e-6];
        return <svg viewBox={`0 0 ${W} ${H}`} className='ownstudio-bode ownstudio-ripple-curve' role='img' aria-label='Ripple vs L'>
            <text x={10} y={14} className='os-axis os-plot-title'>Output ripple vs L</text>
            {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={top} y2={H - bottom} className='os-grid' />
                <text x={x(t)} y={H - 10} textAnchor='middle' className='os-axis'>{eng(t, 'H')}</text></g>)}
            {[0, 0.5, 1].map(k => <text key={k} x={left - 4} y={y(k * yMax) + 3} textAnchor='end' className='os-axis'>{eng(k * yMax, 'V')}</text>)}
            <line x1={left} x2={W - right} y1={y(limit)} y2={y(limit)} className='os-limit' />
            <text x={W - right} y={y(limit) - 4} textAnchor='end' className='os-axis os-limit-label'>limit {eng(limit, 'V')}</text>
            <line x1={x(f.board.inductance_H)} x2={x(f.board.inductance_H)} y1={top} y2={H - bottom} className='os-ref' />
            <text x={x(f.board.inductance_H) + 4} y={H - bottom - 4} className='os-axis'>Twist {eng(f.board.inductance_H, 'H')}</text>
            <polyline fill='none' stroke='#f0dc55' strokeWidth={2}
                points={xs.map((h, i) => `${x(h).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ')} />
            <circle cx={x(L)} cy={y(now)} r={5} fill='#f0dc55' />
            <text x={x(L) + 8} y={y(now) - 6} className='os-axis os-point-label'>{eng(L, 'H')} · {eng(now, 'V')}</text>
        </svg>;
    }

    protected renderLoop(): React.ReactNode {
        const l = this.loop;
        if (!l || this.kp === undefined || this.ti === undefined) {
            return <p className='ownstudio-muted'>Calculating…</p>;
        }
        const m = l.margins;
        const changed = gainsDiffer({ kp: this.kp, ti: this.ti }, l.gains_in_control_cpp);
        const setKp = (v: number) => { this.kp = v; this.schedule(LIVE_MS); this.update(); };
        const setTi = (v: number) => { this.ti = v; this.schedule(LIVE_MS); this.update(); };
        return <>
            <div className='ownstudio-sheet-grid ownstudio-sheet-grid-loop'>
                <div className='ownstudio-sheet-controls'>
                    {this.renderSlider('kp', 'Kp', 'duty/V', this.kp, RANGE.kp, undefined, setKp, setKp)}
                    {this.renderSlider('ti', 'Ti', 's', this.ti, RANGE.ti, undefined, setTi, setTi)}
                    <div className='ownstudio-sheet-fixed'><span>Control period</span><b>{eng(l.inputs.period_s, 's')}</b>
                        <small>the C-Block's sample time, as the firmware's control task</small></div>
                    <div className='ownstudio-sheet-fixed'><span>Plant</span>
                        <b>{eng(l.inputs.inductance_H, 'H')} · {eng(l.inputs.capacitance_F, 'F')} · {eng(l.inputs.v_in_V, 'V')} · {eng(l.inputs.load_ohm, 'Ω')}</b>
                        <small>from the canvas</small></div>
                    <button className='theia-button' disabled={!changed} onClick={() => this.applyGains()} data-action='apply'
                        title='Write Kp and Ti into src/control.cpp (only those two numbers)'>
                        <span className={codicon('save')} /> Apply to the code</button>
                    <p className='ownstudio-muted'>control.cpp has Kp = {l.gains_in_control_cpp.kp}, Ti = {l.gains_in_control_cpp.ti} s.</p>
                </div>
                <div className='ownstudio-cc-summary ownstudio-sheet-margins'>
                    <span className='ownstudio-cc-chip' data-result='crossover'>Crossover {m.crossover_Hz === null ? 'none' : eng(m.crossover_Hz, 'Hz')}</span>
                    <span className={`ownstudio-cc-chip ${m.phase_margin_deg !== null && m.phase_margin_deg < 45 ? 'os-test-fail' : ''}`} data-result='phase_margin'>
                        Phase margin {m.phase_margin_deg === null ? '—' : `${m.phase_margin_deg.toFixed(0)}°`}</span>
                    <span className={`ownstudio-cc-chip ${m.gain_margin_dB !== null && m.gain_margin_dB < 6 ? 'os-test-fail' : ''}`} data-result='gain_margin'>
                        Gain margin {m.gain_margin_dB === null ? '—' : `${m.gain_margin_dB.toFixed(1)} dB`}</span>
                    <span className='ownstudio-cc-chip'>Filter resonance {eng(l.resonance_Hz, 'Hz')}</span>
                </div>
            </div>
            {this.renderBode(l)}
        </>;
    }

    protected renderBode(l: ControlLoopSheet): React.ReactNode {
        const W = 720, H = 200, left = 48, right = 12, top = 10, bottom = 26;
        const f = l.f_Hz;
        const lx0 = Math.log10(f[0]), lx1 = Math.log10(f[f.length - 1]);
        const x = (hz: number) => left + (Math.log10(hz) - lx0) / (lx1 - lx0) * (W - left - right);
        const decades: number[] = [];
        for (let d = Math.ceil(lx0); d <= Math.floor(lx1); d++) {
            decades.push(10 ** d);
        }
        const plot = (title: string, pick: (c: BodeCurve) => number[], lo: number, hi: number, step: number, unit: string, refLine: number) => {
            const y = (v: number) => top + (hi - Math.min(hi, Math.max(lo, v))) / (hi - lo) * (H - top - bottom);
            const ticks: number[] = [];
            for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
                ticks.push(v);
            }
            const m = l.margins;
            return <svg viewBox={`0 0 ${W} ${H}`} className='ownstudio-bode' role='img' aria-label={title}>
                {decades.map(d => <g key={d}><line x1={x(d)} x2={x(d)} y1={top} y2={H - bottom} className='os-grid' />
                    <text x={x(d)} y={H - 8} textAnchor='middle' className='os-axis'>{eng(d, 'Hz')}</text></g>)}
                {ticks.map(t => <g key={t}><line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className='os-grid' />
                    <text x={left - 4} y={y(t) + 3} textAnchor='end' className='os-axis'>{t}{unit}</text></g>)}
                <line x1={left} x2={W - right} y1={y(refLine)} y2={y(refLine)} className='os-ref' />
                <line x1={x(l.resonance_Hz)} x2={x(l.resonance_Hz)} y1={top} y2={H - bottom} className='os-resonance' />
                {m.crossover_Hz !== null && <line x1={x(m.crossover_Hz)} x2={x(m.crossover_Hz)} y1={top} y2={H - bottom} className='os-crossover' />}
                {CURVES.map(c => <polyline key={c.key} fill='none' stroke={c.color} strokeWidth={c.key === 'loop' ? 2.2 : 1.4}
                    points={pick(l[c.key]).map((v, i) => `${x(f[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />)}
                <text x={left + 4} y={top + 12} className='os-axis os-plot-title'>{title}</text>
            </svg>;
        };
        const mags = CURVES.flatMap(c => l[c.key].mag_dB);
        const hi = Math.min(100, Math.ceil(Math.max(...mags) / 20) * 20);
        const lo = Math.max(-80, Math.floor(Math.min(...mags) / 20) * 20);
        return <div className='ownstudio-bode-wrap'>
            <div className='ownstudio-legend'>
                {CURVES.map(c => <span key={c.key}><span className='ownstudio-swatch' style={{ background: c.color, borderColor: c.color }} />{c.label}</span>)}
                <span><span className='ownstudio-swatch os-swatch-resonance' />Filter resonance</span>
                <span><span className='ownstudio-swatch os-swatch-crossover' />Crossover</span>
            </div>
            {plot('Magnitude', c => c.mag_dB, lo, hi, 20, ' dB', 0)}
            {plot('Phase', c => c.phase_deg, -270, 90, 90, '°', -180)}
            <p className='ownstudio-muted'>Averaged model, valid well below the control rate ({eng(1 / l.inputs.period_s, 'Hz')}).
                Check the step response on the simulator in the Lab.</p>
        </div>;
    }
}
