// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ConfirmDialog, codicon } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { Gauge, NumberDisplay, Panel, PanelWidget as Item, Plot, Setpoint, Toggle, panelPaths, parsePanel } from '../common/panel-format.js';
import { LiveValues, formatValue } from './live-values.js';
import { MissionService } from './mission-service.js';

export const PANEL_WIDGET_FACTORY = 'ownstudio.panel';
export interface PanelWidgetOptions { uri: string; }

const PLOT_COLORS = ['#6C8AFF', '#F9F77F', '#FF6112', '#2F9E60'];

/** A Lab panel: hands-on view of data objects, no logic (ADR 0014). */
@injectable()
export class PanelWidget extends ReactWidget {

    @inject(LiveValues) protected readonly live: LiveValues;
    @inject(FileService) protected readonly files: FileService;
    @inject(MissionService) protected readonly missions: MissionService;

    protected uri: URI;
    protected panel: Panel | undefined;
    protected problem: string | undefined;
    protected writeProblem: string | undefined;
    protected subscription: Disposable | undefined;
    protected readonly toDisposeOnDetach = new DisposableCollection();

    configure(options: PanelWidgetOptions): this {
        this.uri = new URI(options.uri);
        this.id = `${PANEL_WIDGET_FACTORY}:${options.uri}`;
        this.title.label = this.uri.path.base.replace(/\.panel\.json$/, '');
        this.title.caption = `Panel ${this.uri.path.fsPath()}`;
        this.title.iconClass = codicon('dashboard');
        this.title.closable = true;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-panel-widget');
        this.node.tabIndex = 0;
        this.load();
        this.toDispose.push(this.files.onDidFilesChange(e => e.contains(this.uri) && this.load()));
        return this;
    }

    protected async load(): Promise<void> {
        try {
            this.panel = parsePanel((await this.files.read(this.uri)).value);
            this.problem = undefined;
        } catch (error) {
            this.panel = undefined;
            this.problem = error instanceof Error ? error.message : String(error);
        }
        this.resubscribe();
        this.update();
    }

    protected resubscribe(): void {
        this.subscription?.dispose();
        this.subscription = this.isAttached && this.panel ? this.live.subscribe(panelPaths(this.panel)) : undefined;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.toDisposeOnDetach.push(this.live.onDidChange(() => this.update()));
        this.resubscribe();
    }

    protected override onBeforeDetach(msg: Message): void {
        this.toDisposeOnDetach.dispose();
        this.subscription?.dispose();
        this.subscription = undefined;
        super.onBeforeDetach(msg);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async write(path: string, value: unknown): Promise<void> {
        try {
            await this.live.write(path, value);
            this.writeProblem = undefined;
        } catch (error) {
            this.writeProblem = `${path}: ${error instanceof Error ? error.message : error}`;
        }
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ownstudio-workbench-body ownstudio-panel-body'>
            <h1 className='ownstudio-title'>{this.title.label}</h1>
            {!this.live.live && <p className='ownstudio-panel-offline'><span className={codicon('debug-disconnect')} /> No board linked: values are not live.</p>}
            {this.live.problem && <p className='ownstudio-problem'>{this.live.problem}</p>}
            {this.writeProblem && <p className='ownstudio-problem'>{this.writeProblem}</p>}
            {this.problem && <p className='ownstudio-problem'>{this.uri.path.base}: {this.problem}</p>}
            {this.panel && <div className='ownstudio-panes'>
                {this.panel.panes.map((pane, i) => <section key={i} className={`ownstudio-pane${pane.widgets.some(w => w.kind === 'plot') ? ' ownstudio-pane-wide' : ''}`}>
                    <h2>{pane.title}</h2>
                    {pane.widgets.map((w, j) => <div key={j} className={`ownstudio-panel-item${w.title === pane.title ? ' ownstudio-same-title' : ''}`}>{this.renderItem(w)}</div>)}
                </section>)}
            </div>}
        </div>;
    }

    protected renderItem(w: Item): React.ReactNode {
        switch (w.kind) {
            case 'gauge': return this.renderGauge(w);
            case 'number': return this.renderNumber(w);
            case 'setpoint': return this.renderSetpoint(w);
            case 'toggle': return this.renderToggle(w);
            case 'plot': return this.renderPlot(w);
            default: return <div className='ownstudio-muted' title={w.reason}>{w.title}: {w.type} is not supported here ({w.reason}).</div>;
        }
    }

    protected value(path: string): number | undefined {
        const v = this.live.live ? this.live.values.get(path) : undefined;
        return typeof v === 'number' ? v : undefined;
    }

    protected renderGauge(w: Gauge): React.ReactNode {
        const v = this.value(w.path);
        const frac = v === undefined ? 0 : Math.min(1, Math.max(0, (v - w.min) / (w.max - w.min)));
        const angle = Math.PI * (1 - frac);
        const x = 60 + 48 * Math.cos(angle);
        const y = 60 - 48 * Math.sin(angle);
        const alarm = v !== undefined && w.critical !== undefined && v > w.critical;
        return <div className='ownstudio-gauge' title={w.path}>
            <div className='ownstudio-item-title'>{w.title}</div>
            <svg viewBox='0 0 120 72' width='160' role='img' aria-label={`${w.title}: ${formatValue(v)} ${w.units}`}>
                <path d='M12 60A48 48 0 0 1 108 60' className='os-gauge-track' />
                {v !== undefined && frac > 0 && <path d={`M12 60A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} className={alarm ? 'os-gauge-bar os-gauge-alarm' : 'os-gauge-bar'} />}
                <text x='60' y='56' textAnchor='middle' className='os-gauge-value'>{formatValue(v)}</text>
                <text x='60' y='70' textAnchor='middle' className='os-gauge-units'>{w.units}</text>
                <text x='12' y='71' textAnchor='middle' className='os-gauge-units'>{w.min}</text>
                <text x='108' y='71' textAnchor='middle' className='os-gauge-units'>{w.max}</text>
            </svg>
        </div>;
    }

    protected renderNumber(w: NumberDisplay): React.ReactNode {
        return <div className='ownstudio-number-display' title={w.path}>
            <div className='ownstudio-item-title'>{w.title}</div>
            <div><span className='ownstudio-big-value'>{formatValue(this.value(w.path))}</span> {w.units}</div>
        </div>;
    }

    protected renderSetpoint(w: Setpoint): React.ReactNode {
        const v = this.value(w.path);
        const disabled = !this.live.live || v === undefined;
        const set = (next: number) => this.write(w.writePath, Math.round(next * 1e6) / 1e6);
        return <div className='ownstudio-setpoint' title={w.writePath}>
            <div className='ownstudio-item-title'>{w.title}</div>
            <div className='ownstudio-setpoint-row'>
                <button className='theia-button secondary' disabled={disabled} aria-label={`${w.title} minus ${w.step}`} onClick={() => v !== undefined && set(v - w.step)}>−</button>
                <input className='theia-input ownstudio-number' type='number' step={w.step} disabled={disabled} aria-label={w.title}
                    key={`${w.path}-${v}`} defaultValue={v ?? ''}
                    onKeyDown={e => { if (e.key === 'Enter') { set(Number(e.currentTarget.value)); } }} />
                <button className='theia-button secondary' disabled={disabled} aria-label={`${w.title} plus ${w.step}`} onClick={() => v !== undefined && set(v + w.step)}>+</button>
                <span>{w.units}</span>
            </div>
        </div>;
    }

    protected renderToggle(w: Toggle): React.ReactNode {
        const raw = this.live.live ? this.live.values.get(w.path) : undefined;
        const on = raw !== undefined && raw === w.on;
        return <div className='ownstudio-toggle' title={w.writePath}>
            <div className='ownstudio-item-title'>{w.title}</div>
            <button className={`theia-button ${on ? 'ownstudio-toggle-on' : 'secondary'}`} disabled={!this.live.live || raw === undefined}
                onClick={() => this.toggle(w, on)}>{raw === undefined ? '—' : on ? 'On' : 'Off'}</button>
        </div>;
    }

    protected async toggle(w: Toggle, on: boolean): Promise<void> {
        if (!on) {
            const envelope = Object.entries(this.missions.mission?.envelope ?? {})
                .map(([port, e]) => `${port} ≤ ${e.v_max_V ?? '—'} V, ${e.i_max_A ?? '—'} A`).join('; ');
            const ok = await new ConfirmDialog({
                title: `Turn on ${w.title}`,
                msg: `This writes ${w.writePath} = ${w.on} on the board. Check what is connected to its ports and that it stays within the safety envelope (${envelope}).`,
                ok: 'Turn on',
            }).open();
            if (!ok) {
                return;
            }
        }
        await this.write(w.writePath, on ? w.off : w.on);
    }

    protected renderPlot(w: Plot): React.ReactNode {
        const W = 760, H = 200, L = 44, B = 22;
        const now = Date.now();
        const series = w.series.map(s => ({ ...s, samples: (this.live.history.get(s.path) ?? []).filter(p => p.t >= now - w.durationMs) }));
        const all = series.flatMap(s => s.samples.map(p => p.v));
        const yMin = w.yMin ?? (all.length ? Math.min(...all) : 0);
        const yMax = w.yMax ?? (all.length ? Math.max(...all) : 1);
        const span = yMax - yMin || 1;
        const px = (t: number) => L + (W - L - 8) * (1 - (now - t) / w.durationMs);
        const py = (v: number) => 8 + (H - B - 8) * (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / span);
        const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => yMin + f * span);
        return <div className='ownstudio-plot'>
            <div className='ownstudio-item-title'>{w.title}</div>
            <svg viewBox={`0 0 ${W} ${H}`} className='ownstudio-plot-svg' role='img' aria-label={w.title}>
                {ticks.map(t => <g key={t}>
                    <line x1={L} x2={W - 8} y1={py(t)} y2={py(t)} className='os-plot-grid' />
                    <text x={L - 6} y={py(t) + 4} textAnchor='end' className='os-plot-label'>{Number(t.toFixed(2))}</text>
                </g>)}
                <text x={L} y={H - 4} className='os-plot-label'>−{w.durationMs / 1000} s</text>
                <text x={W - 8} y={H - 4} textAnchor='end' className='os-plot-label'>now</text>
                <text x={4} y={12} className='os-plot-label'>{w.yLabel}</text>
                {series.map((s, i) => s.samples.length > 1 && <polyline key={s.path} fill='none' stroke={PLOT_COLORS[i % PLOT_COLORS.length]} strokeWidth='1.5'
                    points={s.samples.map(p => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')} />)}
            </svg>
            <div className='ownstudio-legend'>{series.map((s, i) => <span key={s.path}>
                <span className='ownstudio-swatch' style={{ background: PLOT_COLORS[i % PLOT_COLORS.length], borderColor: PLOT_COLORS[i % PLOT_COLORS.length] }} />{s.label}</span>)}</div>
        </div>;
    }
}
