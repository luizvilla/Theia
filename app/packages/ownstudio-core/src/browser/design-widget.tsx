// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WORKBENCHES, widgetId } from './workbenches';
import { MissionService } from './mission-service';
import { BoardService } from '../common/board-protocol';
import { setRequirementValue } from '../common/requirements-edit';

interface SizingResult {
    id: string; title: string; value: number; unit: string; formula: string;
    twist: number | null; meets: boolean | null; note?: string;
}
interface Sizing { inputs: Record<string, unknown>; results: SizingResult[]; }
interface BodeCurve { mag_dB: number[]; phase_deg: number[]; }
interface LoopAnalysis {
    inputs: { kp: number; ti_s: number; period_s: number; v_in_V: number; load_ohm: number };
    resonance_Hz: number;
    f_Hz: number[];
    plant: BodeCurve; controller: BodeCurve; loop: BodeCurve;
    margins: { crossover_Hz: number | null; phase_margin_deg: number | null; phase_crossover_Hz: number | null; gain_margin_dB: number | null };
    gains_in_control_cpp: { kp: number; ti: number };
}

const CURVES: { key: 'plant' | 'controller' | 'loop'; label: string; color: string }[] = [
    { key: 'plant', label: 'Plant G', color: '#6C8AFF' },
    { key: 'controller', label: 'PI C', color: '#B6C9F8' },
    { key: 'loop', label: 'Loop L = C·G', color: '#F9F77F' },
];

/** Engineering notation: 3.3e-5 H → "33 µH". */
export function eng(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
        return `— ${unit}`;
    }
    const prefixes: [number, string][] = [[1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M']];
    for (const [factor, prefix] of prefixes) {
        if (Math.abs(value) < factor * 1000) {
            return `${Number((value / factor).toPrecision(3))} ${prefix}${unit}`;
        }
    }
    return `${value.toPrecision(3)} ${unit}`;
}

/**
 * The Design workbench (SPEC §6): the requirements, the sizing of L and C
 * against the Twist, and the PI on a Bode plot with its margins. The numbers
 * come from the mission's own design/sizing.py and design/loop.py, which
 * students can read; this view only draws them.
 */
@injectable()
export class DesignWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(BoardService) protected readonly service: BoardService;
    @inject(FileService) protected readonly files: FileService;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected sizing: Sizing | undefined;
    protected loop: LoopAnalysis | undefined;
    protected problem: string | undefined;
    protected ripple = '0.4';
    protected kp = '';
    protected ti = '';
    protected periodUs = '100';
    protected busy = false;

    @postConstruct()
    protected init(): void {
        const design = WORKBENCHES.find(w => w.id === 'design')!;
        this.id = widgetId(design);
        this.title.label = design.label;
        this.title.caption = design.purpose;
        this.title.iconClass = codicon(design.icon);
        this.title.closable = false;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-design');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.refresh());
        this.missions.onDidChangeFiles(uris => {
            if (uris.some(u => /\/(design|plant)\/|requirements\.yaml$|control\.cpp$/.test(u.path.toString()))) {
                this.refresh();
            }
        });
        this.refresh();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected missionPath(): string | undefined {
        return this.missions.root?.path.fsPath();
    }

    protected async run<T>(script: string, args: (string | number)[] = []): Promise<T | undefined> {
        const mission = this.missionPath();
        if (!mission || !this.missions.mission) {
            return undefined;
        }
        return await this.service.design(mission, script, args) as T;
    }

    protected async refresh(keepGains = false): Promise<void> {
        if (!this.missions.mission) {
            this.update();
            return;
        }
        this.busy = true;
        this.update();
        try {
            this.problem = undefined;
            this.sizing = await this.run<Sizing>('sizing', ['--ripple-ratio', this.ripple, '--control-period-us', this.periodUs]);
            const args: (string | number)[] = ['--period-us', this.periodUs];
            if (keepGains && this.kp && this.ti) {
                args.push('--kp', this.kp, '--ti', this.ti);
            }
            this.loop = await this.run<LoopAnalysis>('loop', args);
            if (this.loop && !keepGains) {
                this.kp = String(this.loop.inputs.kp);
                this.ti = String(this.loop.inputs.ti_s);
            }
        } catch (error) {
            this.problem = error instanceof Error ? error.message : String(error);
        }
        this.busy = false;
        this.update();
    }

    protected async applyGains(): Promise<void> {
        try {
            await this.run('loop', ['--period-us', this.periodUs, '--kp', this.kp, '--ti', this.ti, '--apply']);
            this.messages.info(`control.cpp now has Kp = ${this.kp} and Ti = ${this.ti} s. Run the step test to see what it does.`);
            await this.refresh(true);
        } catch (error) {
            this.messages.error(`Could not write the gains: ${error instanceof Error ? error.message : error}`);
        }
    }

    protected async saveRequirement(id: string, text: string): Promise<void> {
        const value = Number(text);
        const uri = this.missions.mission?.requirements ? this.missions.resolve(this.missions.mission.requirements) : undefined;
        if (!uri || !Number.isFinite(value)) {
            this.update();
            return;
        }
        try {
            const current = (await this.files.read(uri)).value;
            await this.files.write(uri, setRequirementValue(current, id, value));
        } catch (error) {
            this.messages.error(`requirements.yaml not changed: ${error instanceof Error ? error.message : error}`);
            this.update();
        }
    }

    protected openFile(path: string): void {
        const uri = this.missions.resolve(path);
        if (uri) {
            open(this.opener, uri);
        }
    }

    protected render(): React.ReactNode {
        const design = WORKBENCHES.find(w => w.id === 'design')!;
        if (!this.missions.mission) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>{design.label}</h1>
                <p className='ownstudio-workbench-purpose'>{this.missions.problem}</p>
            </div>;
        }
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{design.label}</h1>
            <p className='ownstudio-workbench-purpose'>{design.purpose} The calculations are the mission's own Python files:{' '}
                <a href='#' onClick={e => { e.preventDefault(); this.openFile('design/sizing.py'); }}>design/sizing.py</a> and{' '}
                <a href='#' onClick={e => { e.preventDefault(); this.openFile('design/loop.py'); }}>design/loop.py</a>.</p>
            {this.problem && <p className='ownstudio-problem'>{this.problem}</p>}
            {this.renderRequirements()}
            {this.renderSizing()}
            {this.renderLoop()}
        </div>;
    }

    protected renderRequirements(): React.ReactNode {
        return <section>
            <h2 className='ownstudio-emphasis'>1 · Requirements</h2>
            <table className='ownstudio-table'>
                <thead><tr><th>Requirement</th><th>Statement</th><th>Value</th><th>Unit</th><th>Verified by</th></tr></thead>
                <tbody>{this.missions.requirements.map(r => <tr key={r.id}>
                    <td><code>{r.id}</code></td><td>{r.statement}</td>
                    <td><input className='theia-input ownstudio-number' defaultValue={String(r.value ?? '')} key={`${r.id}-${r.value}`}
                        aria-label={`${r.id} value`}
                        onBlur={e => e.currentTarget.value !== String(r.value) && this.saveRequirement(r.id, e.currentTarget.value)}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} /></td>
                    <td>{r.unit ?? ''}</td><td>{r.verified_by.join(', ')}</td>
                </tr>)}</tbody>
            </table>
            <p className='ownstudio-muted'>Edits are written to requirements.yaml (comments kept). The tests read their pass criteria from it.</p>
        </section>;
    }

    protected renderSizing(): React.ReactNode {
        const s = this.sizing;
        return <section>
            <h2 className='ownstudio-emphasis'>2 · Size the output filter</h2>
            <p>Current ripple to design for, as a fraction of the largest load:{' '}
                <input className='theia-input ownstudio-number' value={this.ripple} aria-label='Ripple ratio'
                    onChange={e => { this.ripple = e.currentTarget.value; this.update(); }}
                    onKeyDown={e => e.key === 'Enter' && this.refresh(true)} onBlur={() => this.refresh(true)} /></p>
            {!s ? <p className='ownstudio-muted'>{this.busy ? 'Calculating…' : 'No sizing yet.'}</p> :
                <table className='ownstudio-table ownstudio-design-table'>
                    <thead><tr><th>What</th><th>Result</th><th>Formula</th><th>Twist</th><th></th></tr></thead>
                    <tbody>{s.results.map(r => <tr key={r.id}>
                        <td>{r.title}{r.note && <div className='ownstudio-muted'>{r.note}</div>}</td>
                        <td className='ownstudio-design-value'>{eng(r.value, r.unit)}</td>
                        <td><code>{r.formula}</code></td>
                        <td>{r.twist === null ? '' : eng(r.twist, r.unit)}</td>
                        <td className={r.meets === null ? '' : r.meets ? 'os-test-pass' : 'os-test-fail'}>
                            {r.meets === null ? '' : r.meets ? '✓ meets' : '✗ does not meet'}</td>
                    </tr>)}</tbody>
                </table>}
        </section>;
    }

    protected renderLoop(): React.ReactNode {
        const l = this.loop;
        const m = l?.margins;
        const changed = l && (Number(this.kp) !== l.gains_in_control_cpp.kp || Number(this.ti) !== l.gains_in_control_cpp.ti);
        const field = (label: string, value: string, set: (v: string) => void, unit: string) =>
            <label className='ownstudio-design-field'>{label}{' '}
                <input className='theia-input ownstudio-number' value={value} aria-label={label}
                    onChange={e => { set(e.currentTarget.value); this.update(); }}
                    onKeyDown={e => e.key === 'Enter' && this.refresh(true)} /> {unit}</label>;
        return <section>
            <h2 className='ownstudio-emphasis'>3 · Tune the PI on a Bode plot</h2>
            <div className='ownstudio-button-row'>
                {field('Kp', this.kp, v => this.kp = v, 'duty/V')}
                {field('Ti', this.ti, v => this.ti = v, 's')}
                {field('Control period', this.periodUs, v => this.periodUs = v, 'µs')}
                <button className='theia-button secondary' disabled={this.busy} onClick={() => this.refresh(true)}>
                    <span className={codicon('graph-line')} /> Plot</button>
                <button className='theia-button' disabled={this.busy || !changed} onClick={() => this.applyGains()}
                    title='Write Kp and Ti into firmware/control.cpp (only those two numbers)'>
                    <span className={codicon('save')} /> Apply to control.cpp</button>
            </div>
            {l && <p className='ownstudio-muted'>control.cpp has Kp = {l.gains_in_control_cpp.kp}, Ti = {l.gains_in_control_cpp.ti} s.
                {' '}The control period is the firmware's critical task period; changing it here does not change the firmware.</p>}
            {m && <div className='ownstudio-cc-summary'>
                <span className='ownstudio-cc-chip'>Crossover {m.crossover_Hz === null ? 'none' : eng(m.crossover_Hz, 'Hz')}</span>
                <span className={`ownstudio-cc-chip ${m.phase_margin_deg !== null && m.phase_margin_deg < 45 ? 'os-test-fail' : ''}`}>
                    Phase margin {m.phase_margin_deg === null ? '—' : `${m.phase_margin_deg.toFixed(0)}°`}</span>
                <span className={`ownstudio-cc-chip ${m.gain_margin_dB !== null && m.gain_margin_dB < 6 ? 'os-test-fail' : ''}`}>
                    Gain margin {m.gain_margin_dB === null ? '—' : `${m.gain_margin_dB.toFixed(1)} dB`}</span>
                <span className='ownstudio-cc-chip'>Filter resonance {eng(l!.resonance_Hz, 'Hz')}</span>
            </div>}
            {l && this.renderBode(l)}
        </section>;
    }

    protected renderBode(l: LoopAnalysis): React.ReactNode {
        const W = 720, H = 200, left = 48, right = 12, top = 10, bottom = 26;
        const f = l.f_Hz;
        const lx0 = Math.log10(f[0]), lx1 = Math.log10(f[f.length - 1]);
        const x = (hz: number) => left + (Math.log10(hz) - lx0) / (lx1 - lx0) * (W - left - right);
        const decades: number[] = [];
        for (let d = Math.ceil(lx0); d <= Math.floor(lx1); d++) {
            decades.push(10 ** d);
        }
        const plot = (title: string, pick: (c: BodeCurve) => number[], lo: number, hi: number, step: number, unit: string,
            refLine: number) => {
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
                Operating point: {l.inputs.v_in_V} V in, {l.inputs.load_ohm} Ω load. design/loop.py compares the plant with Pulsim's switched model.</p>
        </div>;
    }
}
