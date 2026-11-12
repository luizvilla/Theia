// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import uPlot = require('uplot');
import 'uplot/dist/uPlot.min.css';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { CommandService } from '@theia/core/lib/common';
import { ProcedureModel } from './procedure-model';
import { MissionService } from './mission-service';
import { statusText } from '../common/procedure-protocol';
import { eventWindow, Waveform, parseWaveform } from '../common/waveform';
import { Band, TestRecord, bands, clip, compareCases, formatConditions, twinPath } from '../common/overlay';
import { OPEN_PULSIMGUI_COMMAND } from './pulsimgui-contribution';

export const PROCEDURE_WIDGET_ID = 'ownstudio.procedure';
// Theia's esbuild pipeline selects uPlot's ESM entry even for this CommonJS
// TypeScript output, so the constructor is its default export at runtime.
const UPlot = ((uPlot as unknown as { default?: typeof uPlot }).default ?? uPlot) as typeof uPlot;

interface PlotProps { waveform: Waveform; }

/** uPlot owns its canvas: React only gives it a mount and the accessible controls around it. */
class InteractiveCapturePlot extends React.Component<PlotProps> {
    protected readonly mount = React.createRef<HTMLDivElement>();
    protected plot: uPlot | undefined;
    protected visible: boolean[] = [];

    componentDidMount(): void { this.build(); }
    componentDidUpdate(previous: PlotProps): void {
        if (previous.waveform !== this.props.waveform) {
            this.plot?.destroy();
            this.build();
        }
    }
    componentWillUnmount(): void { this.plot?.destroy(); }

    protected build(): void {
        const mount = this.mount.current;
        const series = this.props.waveform.series?.filter(channel => channel.values.length === this.props.waveform.t.length) ?? [];
        if (!mount || !series.length) {
            return;
        }
        this.visible = series.map(() => true);
        const initial = eventWindow(this.props.waveform.t);
        const colours = ['#d99128', '#2c8dbf', '#2f9e60', '#9b6dcc'];
        const scaleOf = (name: string) => name.endsWith('_A') ? 'current' : 'voltage';
        const options: uPlot.Options = {
            width: Math.max(520, Math.min(920, mount.clientWidth || 760)), height: 300,
            scales: { x: { time: false }, voltage: { auto: true }, current: { auto: true } },
            axes: [
                { values: (_u, ticks) => ticks.map(value => `${(value * 1e3).toFixed(1)} ms`) },
                { scale: 'voltage', label: 'V' },
                { scale: 'current', side: 1, label: 'A', grid: { show: false } },
            ],
            cursor: { drag: { x: true, y: false, setScale: true } },
            legend: { show: true },
            series: [{ label: 'Time' }, ...series.map((channel, index) => ({
                label: channel.name, scale: scaleOf(channel.name), stroke: colours[index % colours.length], width: 2,
            }))],
            hooks: {
                ready: [plot => {
                    this.addWheelNavigation(plot);
                    plot.setScale('x', { min: initial[0], max: initial[1] });
                }],
                setScale: [(plot, key) => { if (key === 'x') { this.markScale(plot); } }],
            },
        };
        this.plot = new UPlot(options, [this.props.waveform.t, ...series.map(channel => channel.values)] as uPlot.AlignedData, mount);
    }

    /** Wheel zooms around the cursor; Shift+wheel pans. Drag selects a zoom window. */
    protected addWheelNavigation(plot: uPlot): void {
        plot.over.addEventListener('wheel', event => {
            event.preventDefault();
            const scale = plot.scales.x;
            if (scale.min === undefined || scale.max === undefined) {
                return;
            }
            const span = scale.max - scale.min;
            if (event.shiftKey) {
                const shift = span * Math.sign(event.deltaY) * 0.12;
                plot.setScale('x', { min: scale.min + shift, max: scale.max + shift });
            } else {
                const rect = plot.over.getBoundingClientRect();
                const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                const centre = scale.min + span * fraction;
                const factor = event.deltaY > 0 ? 1.2 : 0.8;
                plot.setScale('x', { min: centre - span * factor * fraction, max: centre + span * factor * (1 - fraction) });
            }
        }, { passive: false });
    }

    protected markScale(plot: uPlot): void {
        const holder = this.mount.current?.parentElement;
        const scale = plot.scales.x;
        if (holder && scale.min !== undefined && scale.max !== undefined) {
            holder.dataset.currentStart = String(scale.min);
            holder.dataset.currentEnd = String(scale.max);
        }
    }

    protected wholeRun(): void {
        const t = this.props.waveform.t;
        this.plot?.setScale('x', { min: t[0], max: t[t.length - 1] });
    }

    protected toggle(index: number): void {
        this.visible[index] = !this.visible[index];
        this.plot?.setSeries(index + 1, { show: this.visible[index] });
        this.forceUpdate();
    }

    render(): React.ReactNode {
        const series = this.props.waveform.series ?? [];
        const initial = eventWindow(this.props.waveform.t);
        return <div className='ownstudio-capture-result' data-view-start={initial[0]} data-view-end={initial[1]}>
            <div className='ownstudio-button-row ownstudio-plot-controls'>
                <button className='theia-button secondary' onClick={() => this.wholeRun()}>Whole run</button>
                {series.map((channel, index) => <button key={channel.name} className={`theia-button secondary${this.visible[index] === false ? ' os-channel-off' : ''}`}
                    aria-pressed={this.visible[index] !== false} onClick={() => this.toggle(index)}>{channel.name}</button>)}
                <span className='ownstudio-muted'>Drag to zoom · Shift+wheel to pan · cursor values in the legend</span>
            </div>
            <div ref={this.mount} className='ownstudio-uplot' />
        </div>;
    }
}

/**
 * The procedure run in progress or last run: its log, its questions, its records
 * and waveforms. A board record is drawn with its simulation (its "twin", run at
 * the same conditions): requirement bands, simulation and measurement on one
 * time axis, and each case on both targets.
 */
@injectable()
export class ProcedureWidget extends ReactWidget {
    @inject(ProcedureModel) protected readonly model: ProcedureModel;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(FileService) protected readonly files: FileService;
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(CommandService) protected readonly commands: CommandService;

    protected waveforms = new Map<string, Waveform | null>();
    protected recordFiles = new Map<string, TestRecord | null>();
    protected numberAnswer = '';
    protected reloadedSimulation = -1;

    @postConstruct()
    protected init(): void {
        this.id = PROCEDURE_WIDGET_ID;
        this.title.label = 'Procedure';
        this.title.caption = 'The procedure run in progress or last run';
        this.title.iconClass = codicon('run');
        this.title.closable = true;
        this.addClass('ownstudio-procedure');
        this.node.tabIndex = 0;
        this.model.onDidChange(() => { this.loadWaveforms(); this.update(); });
        this.loadWaveforms();
        this.update();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.loadWaveforms();
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async loadWaveforms(): Promise<void> {
        const run = this.model.current;
        // The simulator record event is emitted while the procedure is still
        // writing it; after done, reread both linked record.json files once.
        if (run?.simulationOf && run.done && run.runId !== this.reloadedSimulation) {
            this.reloadedSimulation = run.runId;
            for (const record of run.records) {
                this.recordFiles.delete(record.path);
                this.waveforms.delete(record.path);
            }
        }
        for (const r of this.model.current?.records ?? []) {
            await this.load(r.path);
            const rec = this.recordFiles.get(r.path);
            if (rec?.twin) {
                await this.load(twinPath(r.path, rec.twin));
            }
        }
    }

    /** record.json and waveform.csv of a record folder, once. */
    protected async load(path: string): Promise<void> {
        if (this.recordFiles.has(path)) {
            return;
        }
        this.recordFiles.set(path, null);
        this.waveforms.set(path, null);
        try {
            this.recordFiles.set(path, JSON.parse((await this.files.read(URI.fromFilePath(`${path}/record.json`))).value));
            const wave = URI.fromFilePath(`${path}/waveform.csv`);
            if (await this.files.exists(wave)) {
                this.waveforms.set(path, parseWaveform((await this.files.read(wave)).value));
            }
        } catch {
            // not written yet, or no waveform for this record
        }
        this.update();
    }

    /** A simulator record shown as the twin of a board record of this run: drawn with it, not alone. */
    protected isShownAsTwin(path: string): boolean {
        const run = this.model.current;
        const rec = this.recordFiles.get(path);
        return !!run && !!rec?.twin && rec.target === 'simulator'
            && run.records.some(r => twinPath(path, rec.twin!) === r.path && this.recordFiles.get(r.path)?.target === 'board');
    }

    protected render(): React.ReactNode {
        const run = this.model.current;
        if (!run) {
            return <div className='ownstudio-workbench-body'><h1 className='ownstudio-title'>Procedure</h1>
                <p className='ownstudio-workbench-purpose'>No procedure has run yet. Start one from the Lab.</p></div>;
        }
        const state = !run.done ? 'running…' : statusText(run.done.status);
        const where = run.simulationOf ? 'Board and simulation' : `On the ${run.target}`;
        const first = this.recordFiles.get(run.records[0]?.path ?? '');
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{run.past ? first?.procedure ?? run.info.title : run.info.title}</h1>
            {run.past
                ? <p className='ownstudio-workbench-purpose'>Filed {first?.date ? new Date(first.date).toLocaleString() : 'earlier'}.{' '}
                    {first?.twin ? 'A board run and its simulation at the same conditions.' : `Run on the ${first?.target ?? run.target}.`}</p>
                : <p className='ownstudio-workbench-purpose'>{where} · started {run.started.toLocaleTimeString()} ·{' '}
                    <b className={run.done ? (run.done.status === 0 ? 'os-test-pass' : 'os-test-fail') : ''}>{state}</b>{' '}
                    {!run.done && <button className='theia-button secondary' onClick={() => this.model.stop()}>
                        <span className={codicon('debug-stop')} /> Stop</button>}</p>}
            {run.ask && this.renderAsk(run.ask)}
            {run.done?.error && <pre className='ownstudio-problem ownstudio-procedure-log'>{run.done.error}</pre>}
            {run.records.filter(r => !this.isShownAsTwin(r.path)).map(r => this.renderRecord(r.path, r.verdict))}
            {!run.past && <>
                <h2 className='ownstudio-emphasis'>Log</h2>
                <pre className='ownstudio-procedure-log'>{run.log.join('\n') || '…'}</pre></>}
        </div>;
    }

    protected renderVerdict(verdict: string): React.ReactNode {
        return <span className={verdict === 'PASS' || verdict === 'INFO' ? 'os-test-pass' : verdict === 'FAIL' ? 'os-test-fail' : 'os-test-blocked'}>
            {verdict === 'PASS' ? '✓' : verdict === 'FAIL' ? '✗' : verdict === 'INFO' ? 'i' : '–'} {verdict || '…'}</span>;
    }

    protected renderLink(path: string): React.ReactNode {
        return <a href='#' onClick={e => { e.preventDefault(); open(this.opener, URI.fromFilePath(`${path}/record.md`)); }}>
            {path.split(/[\\/]/).slice(-2).join('/')}</a>;
    }

    protected renderRecord(path: string, verdict: string): React.ReactNode {
        const run = this.model.current;
        const shown = this.recordFiles.get(path);
        if (shown?.target === 'simulator' && shown.twin) {
            // A board run's simulation: show it through its board record, where the two are compared.
            const board = twinPath(path, shown.twin);
            if (this.recordFiles.get(board)?.target === 'board') {
                return this.renderRecord(board, '');
            }
        }
        const rec = shown;
        const twin = rec?.target === 'board' && rec.twin ? twinPath(path, rec.twin) : undefined;
        const sim = twin ? this.recordFiles.get(twin) ?? undefined : undefined;
        return <div key={path} className='ownstudio-card'>
            <div className='ownstudio-card-title'>
                {this.renderVerdict(rec?.verdict ?? verdict)} {this.renderLink(path)}
                {rec?.board?.serial_number && <span className='ownstudio-muted'> · board {rec.board.serial_number}</span>}
            </div>
            {rec?.conditions && <div className='ownstudio-muted'>Conditions: {formatConditions(rec.conditions)}</div>}
            {rec?.target === 'board' && <div className='ownstudio-button-row ownstudio-result-actions'>
                {!twin && run?.done && run.info.targets.includes('simulator') &&
                    <button className='theia-button' data-simulate-record={path} onClick={() => this.model.simulateRecord(path)}>
                        <span className={codicon('play')} /> Simulate at these conditions</button>}
                {!twin && run?.simulationOf === path && !run.done && <span className='ownstudio-muted'>Simulating at these conditions…</span>}
                <button className='theia-button secondary' onClick={() => this.commands.executeCommand(OPEN_PULSIMGUI_COMMAND.id)}>
                    <span className={codicon('circuit-board')} /> Open in PulsimGui</button>
                {rec.report && <button className='theia-button secondary' onClick={() => this.openReport(rec.report!)}>
                    <span className={codicon('report')} /> Report</button>}
            </div>}
            {twin
                ? <>
                    <div className='ownstudio-muted'>Simulated at the same conditions: {sim ? <>{this.renderVerdict(sim.verdict)} {this.renderLink(twin)}</> : 'reading…'}</div>
                    {this.renderPlot(this.waveforms.get(path), this.waveforms.get(twin), rec ? rec.cases : [])}
                    {rec && this.renderComparison(rec, sim)}</>
                : <>{this.renderPlot(this.waveforms.get(path), undefined, rec?.cases ?? [])}{rec && this.renderMetrics(rec)}</>}
            {rec?.target !== 'board' && rec?.report && <div className='ownstudio-button-row'><button className='theia-button secondary' onClick={() => this.openReport(rec.report!)}>
                <span className={codicon('report')} /> Open HTML report</button></div>}
        </div>;
    }

    protected openReport(report: string): void {
        const uri = report.startsWith('/') ? URI.fromFilePath(report) : this.missions.resolve(report);
        if (uri) {
            open(this.opener, uri);
        }
    }

    protected renderMetrics(record: TestRecord): React.ReactNode {
        if (!record.cases.length) {
            return undefined;
        }
        return <table className='ownstudio-table ownstudio-overlay-table'><thead><tr><th>Metric</th><th>Measured</th><th>Verdict</th></tr></thead>
            <tbody>{record.cases.map(c => <tr key={c.id}><td>{c.title}</td><td>{typeof c.measured === 'number' ? Number(c.measured.toPrecision(4)) : c.measured ?? c.reason ?? '—'} {c.unit ?? ''}</td>
                <td>{this.renderVerdict(c.verdict ?? (c.passed ? 'PASS' : c.passed === false ? 'FAIL' : 'INFO'))}</td></tr>)}</tbody></table>;
    }

    protected renderComparison(board: TestRecord, sim: TestRecord | undefined): React.ReactNode {
        const show = (v: number | string | undefined, unit: string) =>
            v === undefined ? '—' : typeof v === 'number' ? `${Number(v.toPrecision(4))} ${unit}` : v;
        return <table className='ownstudio-table ownstudio-overlay-table'>
            <thead><tr><th>Case</th><th>Criterion</th><th>Simulation</th><th>Board</th><th>Board − simulation</th></tr></thead>
            <tbody>{compareCases(board, sim).map(r => <tr key={r.id}>
                <td><code>{r.id}</code> {r.title}</td>
                <td>{r.criterion}</td>
                <td>{show(r.simulation, r.unit)} {r.simulationVerdict && <span className='ownstudio-muted'>({r.simulationVerdict})</span>}</td>
                <td>{show(r.board, r.unit)} <span className='ownstudio-muted'>({r.boardVerdict})</span></td>
                <td>{r.difference === undefined ? '—' : `${r.difference >= 0 ? '+' : ''}${Number(r.difference.toPrecision(3))} ${r.unit}`}</td>
            </tr>)}</tbody>
        </table>;
    }

    protected renderAsk(ask: { kind: 'number' | 'confirm'; question: string }): React.ReactNode {
        return <div className='ownstudio-card ownstudio-procedure-ask' role='alertdialog' aria-label='The procedure asks'>
            <div className='ownstudio-card-title'>{ask.question}</div>
            {ask.kind === 'confirm'
                ? <div className='ownstudio-button-row'>
                    <button className='theia-button' onClick={() => this.model.answer(true)}>Yes</button>
                    <button className='theia-button secondary' onClick={() => this.model.answer(false)}>No</button>
                    <button className='theia-button secondary' onClick={() => this.model.answer(null)}>Cancel the procedure</button></div>
                : <div className='ownstudio-button-row'>
                    <input className='theia-input ownstudio-number' aria-label='Answer' value={this.numberAnswer} autoFocus
                        onChange={e => { this.numberAnswer = e.currentTarget.value; this.update(); }}
                        onKeyDown={e => e.key === 'Enter' && this.sendNumber()} />
                    <button className='theia-button' disabled={!Number.isFinite(Number(this.numberAnswer.replace(',', '.'))) || !this.numberAnswer}
                        onClick={() => this.sendNumber()}>OK</button>
                    <button className='theia-button secondary' onClick={() => this.model.answer(null)}>Cancel the procedure</button></div>}
        </div>;
    }

    protected sendNumber(): void {
        const value = Number(this.numberAnswer.replace(',', '.'));
        if (this.numberAnswer && Number.isFinite(value)) {
            this.numberAnswer = '';
            this.model.answer(value);
        }
    }

    /**
     * LOW1 against time. With a simulation: the board's window, the simulation clipped to it
     * (dashed), and the requirement bands of the cases (shaded, each over its own window).
     */
    protected renderPlot(w: Waveform | null | undefined, sim: Waveform | null | undefined, cases: TestRecord['cases']): React.ReactNode {
        if (!w || w.t.length < 2) {
            return undefined;
        }
        if (!sim && w.series?.length) {
            return <InteractiveCapturePlot waveform={w} />;
        }
        const W = 720, H = 200, left = 48, right = 10, top = 22, bottom = 22;
        const t0 = w.t[0], t1 = w.t[w.t.length - 1];
        const s = sim ? clip(sim, t0, t1) : undefined;
        const bs: Band[] = bands(cases, t0, t1);
        const all = [...w.v, ...(s?.v ?? []), ...bs.flatMap(b => [b.low, b.high])];
        const vmin = Math.min(...all), vmax = Math.max(...all);
        const pad = (vmax - vmin) * 0.05 || 1;
        const lo = vmin - pad, hi = vmax + pad;
        const x = (t: number) => left + (t - t0) / (t1 - t0) * (W - left - right);
        const y = (v: number) => top + (hi - v) / (hi - lo) * (H - top - bottom);
        const line = (u: Waveform) => u.t.map((t, i) => `${x(t).toFixed(1)},${y(u.v[i]).toFixed(1)}`).join(' ');
        const ticksV = [lo, (lo + hi) / 2, hi];
        const ticksT = [t0, ...(t0 < 0 && t1 > 0 ? [0] : [(t0 + t1) / 2]), t1];
        const label = sim ? 'LOW1: measured on the board (solid), simulated (dashed), requirement (shaded)' : 'LOW1 voltage (waveform.csv)';
        return <svg viewBox={`0 0 ${W} ${H}`} className='ownstudio-bode' role='img' aria-label={label}>
            {bs.map(b => <rect key={b.caseId} x={x(b.t0)} width={Math.max(1, x(b.t1) - x(b.t0))} y={y(b.high)} height={Math.max(1, y(b.low) - y(b.high))}
                className='os-band'><title>{b.label}</title></rect>)}
            {ticksV.map(v => <g key={v}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className='os-grid' />
                <text x={left - 4} y={y(v) + 3} textAnchor='end' className='os-axis'>{v.toFixed(2)} V</text></g>)}
            {ticksT.map((t, i) => <text key={t} x={x(t)} y={H - 6} className='os-axis'
                textAnchor={i === 0 ? 'start' : i === ticksT.length - 1 ? 'end' : 'middle'}>{(t * 1e3).toFixed(1)} ms</text>)}
            {/* The measurement first, the simulation on top: a board's sample noise would hide it. */}
            <polyline fill='none' className={sim ? 'os-trace-board os-trace-under' : 'os-trace-board'} strokeWidth='1.2' points={line(w)} />
            {s && s.t.length > 1 && <polyline fill='none' className='os-trace-sim' strokeWidth='2' strokeDasharray='6 3' points={line(s)} />}
            <text x={left + 4} y={14} className='os-axis os-plot-title'>{label}</text>
        </svg>;
    }
}
