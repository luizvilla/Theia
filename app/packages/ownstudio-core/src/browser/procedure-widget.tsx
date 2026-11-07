// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ProcedureModel } from './procedure-model';
import { statusText } from '../common/procedure-protocol';
import { Waveform, parseWaveform } from '../common/waveform';
import { Band, TestRecord, bands, clip, compareCases, formatConditions, twinPath } from '../common/overlay';

export const PROCEDURE_WIDGET_ID = 'ownstudio.procedure';

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

    protected waveforms = new Map<string, Waveform | null>();
    protected recordFiles = new Map<string, TestRecord | null>();
    protected numberAnswer = '';

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
        const first = this.recordFiles.get(run.records[0]?.path ?? '');
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{run.past ? first?.procedure ?? run.info.title : run.info.title}</h1>
            {run.past
                ? <p className='ownstudio-workbench-purpose'>Filed {first?.date ? new Date(first.date).toLocaleString() : 'earlier'}.{' '}
                    {first?.twin ? 'A board run and its simulation at the same conditions.' : `Run on the ${first?.target ?? run.target}.`}</p>
                : <p className='ownstudio-workbench-purpose'>On the {run.target} · started {run.started.toLocaleTimeString()} ·{' '}
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
        return <span className={verdict === 'PASS' ? 'os-test-pass' : verdict === 'FAIL' ? 'os-test-fail' : 'os-test-blocked'}>
            {verdict === 'PASS' ? '✓' : verdict === 'FAIL' ? '✗' : '–'} {verdict || '…'}</span>;
    }

    protected renderLink(path: string): React.ReactNode {
        return <a href='#' onClick={e => { e.preventDefault(); open(this.opener, URI.fromFilePath(`${path}/record.md`)); }}>
            {path.split(/[\\/]/).slice(-2).join('/')}</a>;
    }

    protected renderRecord(path: string, verdict: string): React.ReactNode {
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
            {twin
                ? <>
                    <div className='ownstudio-muted'>Simulated at the same conditions: {sim ? <>{this.renderVerdict(sim.verdict)} {this.renderLink(twin)}</> : 'reading…'}</div>
                    {this.renderPlot(this.waveforms.get(path), this.waveforms.get(twin), rec ? rec.cases : [])}
                    {rec && this.renderComparison(rec, sim)}</>
                : this.renderPlot(this.waveforms.get(path), undefined, rec?.cases ?? [])}
        </div>;
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
            {s && s.t.length > 1 && <polyline fill='none' className='os-trace-sim' strokeWidth='1.4' strokeDasharray='5 3' points={line(s)} />}
            <polyline fill='none' className='os-trace-board' strokeWidth='1.4' points={line(w)} />
            <text x={left + 4} y={14} className='os-axis os-plot-title'>{label}</text>
        </svg>;
    }
}
