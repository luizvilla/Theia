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

export const PROCEDURE_WIDGET_ID = 'ownstudio.procedure';

/** The procedure run in progress or last run: its log, its questions, its records and waveform. */
@injectable()
export class ProcedureWidget extends ReactWidget {
    @inject(ProcedureModel) protected readonly model: ProcedureModel;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(FileService) protected readonly files: FileService;

    protected waveforms = new Map<string, Waveform | null>();
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
        this.update();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async loadWaveforms(): Promise<void> {
        for (const r of this.model.current?.records ?? []) {
            if (this.waveforms.has(r.path)) {
                continue;
            }
            this.waveforms.set(r.path, null);
            const uri = URI.fromFilePath(`${r.path}/waveform.csv`);
            try {
                if (await this.files.exists(uri)) {
                    this.waveforms.set(r.path, parseWaveform((await this.files.read(uri)).value));
                    this.update();
                }
            } catch {
                // no waveform for this record
            }
        }
    }

    protected render(): React.ReactNode {
        const run = this.model.current;
        if (!run) {
            return <div className='ownstudio-workbench-body'><h1 className='ownstudio-title'>Procedure</h1>
                <p className='ownstudio-workbench-purpose'>No procedure has run yet. Start one from the Lab.</p></div>;
        }
        const state = !run.done ? 'running…' : statusText(run.done.status);
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>{run.info.title}</h1>
            <p className='ownstudio-workbench-purpose'>On the {run.target} · started {run.started.toLocaleTimeString()} ·{' '}
                <b className={run.done ? (run.done.status === 0 ? 'os-test-pass' : 'os-test-fail') : ''}>{state}</b>{' '}
                {!run.done && <button className='theia-button secondary' onClick={() => this.model.stop()}>
                    <span className={codicon('debug-stop')} /> Stop</button>}</p>
            {run.ask && this.renderAsk(run.ask)}
            {run.done?.error && <pre className='ownstudio-problem ownstudio-procedure-log'>{run.done.error}</pre>}
            {run.records.map(r => <div key={r.path} className='ownstudio-card'>
                <div className='ownstudio-card-title'>
                    <span className={r.verdict === 'PASS' ? 'os-test-pass' : r.verdict === 'FAIL' ? 'os-test-fail' : 'os-test-blocked'}>
                        {r.verdict === 'PASS' ? '✓' : r.verdict === 'FAIL' ? '✗' : '–'} {r.verdict}</span>
                    <a href='#' onClick={e => { e.preventDefault(); open(this.opener, URI.fromFilePath(`${r.path}/record.md`)); }}>
                        {r.path.split('/').slice(-2).join('/')}</a>
                </div>
                {this.renderWaveform(this.waveforms.get(r.path))}
            </div>)}
            <h2 className='ownstudio-emphasis'>Log</h2>
            <pre className='ownstudio-procedure-log'>{run.log.join('\n') || '…'}</pre>
        </div>;
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

    protected renderWaveform(w: Waveform | null | undefined): React.ReactNode {
        if (!w || w.t.length < 2) {
            return undefined;
        }
        const W = 720, H = 180, left = 44, right = 10, top = 8, bottom = 22;
        const t0 = w.t[0], t1 = w.t[w.t.length - 1];
        const vmin = Math.min(...w.v), vmax = Math.max(...w.v);
        const pad = (vmax - vmin) * 0.05 || 1;
        const lo = vmin - pad, hi = vmax + pad;
        const x = (t: number) => left + (t - t0) / (t1 - t0) * (W - left - right);
        const y = (v: number) => top + (hi - v) / (hi - lo) * (H - top - bottom);
        const ticksV = [lo, (lo + hi) / 2, hi];
        const ticksT = [t0, (t0 + t1) / 2, t1];
        return <svg viewBox={`0 0 ${W} ${H}`} className='ownstudio-bode' role='img' aria-label='LOW1 voltage against time'>
            {ticksV.map(v => <g key={v}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className='os-grid' />
                <text x={left - 4} y={y(v) + 3} textAnchor='end' className='os-axis'>{v.toFixed(2)} V</text></g>)}
            {ticksT.map(t => <text key={t} x={x(t)} y={H - 6} textAnchor='middle' className='os-axis'>{(t * 1e3).toFixed(1)} ms</text>)}
            <polyline fill='none' stroke='#F9F77F' strokeWidth='1.2' points={w.t.map((t, i) => `${x(t).toFixed(1)},${y(w.v[i]).toFixed(1)}`).join(' ')} />
            <text x={left + 4} y={top + 12} className='os-axis os-plot-title'>LOW1 voltage (waveform.csv)</text>
        </svg>;
    }
}
