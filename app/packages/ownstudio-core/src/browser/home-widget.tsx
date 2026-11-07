// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import { BlockKey, Mission, Port, wrap } from './mission';
import { MissionService } from './mission-service';
import { BoardModel } from './board-model';
import { boardName } from '../common/board-protocol';
import { BRIDGE_BLOCKS, BridgeBlock, revisionOf } from '../common/board-pack';
import { Requirement, RequirementState, STATE_LABEL, TargetResult, Verification, verify } from '../common/verification';

export type Layer = 'specification' | 'build' | 'verification';
const LAYERS: { id: Layer; label: string; question: string }[] = [
    { id: 'specification', label: 'Specification', question: 'What must it do?' },
    { id: 'build', label: 'Build', question: 'What is it?' },
    { id: 'verification', label: 'Verification', question: 'What has been shown?' },
];
const STATES: RequirementState[] = ['no-case', 'untested', 'sim-pass', 'bench-pass', 'fail', 'disagree'];
import { WORKBENCHES, widgetId } from './workbenches';

type Box = { x: number; y: number; w: number; h: number };

// Layout of the five blocks, the bridge row and the environment (SPEC §4).
const POWER: Box = { x: 232, y: 72, w: 296, h: 104 };
const MEASUREMENT: Box = { x: 40, y: 256, w: 208, h: 88 };
const APS: Box = { x: 276, y: 256, w: 208, h: 88 };
const DRIVER: Box = { x: 512, y: 256, w: 208, h: 88 };
const CONTROLLER: Box = { x: 232, y: 400, w: 296, h: 88 };
const ENV_IN: Box = { x: 24, y: 72, w: 160, h: 104 };
const ENV_OUT: Box = { x: 576, y: 72, w: 160, h: 104 };
const OUTSIDE: Box = { x: 584, y: 400, w: 152, h: 88 };
const BOXES: Record<BlockKey, Box> = { power: POWER, measurement: MEASUREMENT, aps: APS, driver: DRIVER, controller: CONTROLLER };

/**
 * Home: the opened mission's converter as its five blocks, with three layers
 * borrowed from the V-model (SPEC §5): Specification (requirements, safety in
 * red), Build (blocks, board, firmware), Verification (each requirement
 * coloured by its latest test records).
 */
@injectable()
export class HomeWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected layer: Layer = 'build';

    @postConstruct()
    protected init(): void {
        const home = WORKBENCHES[0];
        this.id = widgetId(home);
        this.title.label = home.label;
        this.title.caption = home.purpose;
        this.title.iconClass = codicon(home.icon);
        this.title.closable = false;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-home');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.update());
        this.board.onDidChange(() => this.update());
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    setLayer(layer: Layer): void {
        this.layer = layer;
        this.update();
    }

    protected openFile(path: string | null | undefined): void {
        const uri = path ? this.missions.resolve(path) : undefined;
        if (uri) {
            open(this.opener, uri);
        }
    }

    protected verifications(): Map<string, Verification> {
        return new Map(this.missions.requirements.map(r => [r.id, verify(r, this.missions.records)]));
    }

    protected render(): React.ReactNode {
        const m = this.missions.mission;
        if (!m) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>Home</h1>
                <p className='ownstudio-workbench-purpose'>{this.missions.problem}</p>
            </div>;
        }
        const verifications = this.verifications();
        return <div className='ownstudio-workbench-body ownstudio-home-body'>
            <h1 className='ownstudio-emphasis ownstudio-mission-title'>{m.title}</h1>
            <p className='ownstudio-workbench-purpose'>{m.summary}</p>
            <div className='ownstudio-layer-tabs' role='tablist'>
                {LAYERS.map(l => <button key={l.id} role='tab' aria-selected={this.layer === l.id}
                    className={`ownstudio-layer${this.layer === l.id ? ' ownstudio-layer-active' : ''}`}
                    title={l.question} onClick={() => this.setLayer(l.id)}>{l.label}</button>)}
                <span className='ownstudio-layer-question'>{LAYERS.find(l => l.id === this.layer)!.question}</span>
            </div>
            <div className={`ownstudio-home-columns ownstudio-layer-${this.layer}`}>
                <div className='ownstudio-home-diagram'>
                    {this.renderDiagram(m, verifications)}
                    {this.layer === 'verification' && this.renderLegend()}
                    <p className='ownstudio-home-note'>{this.note()}</p>
                </div>
                <aside className='ownstudio-home-panel'>
                    {this.layer === 'specification' && this.renderSpecification(m)}
                    {this.layer === 'build' && this.renderBuild(m)}
                    {this.layer === 'verification' && this.renderVerification(verifications)}
                </aside>
            </div>
        </div>;
    }

    protected note(): string {
        switch (this.layer) {
            case 'specification': return 'Red: the safety envelope at each port (indicative, not certification). Badges count the requirements on each port.';
            case 'build': return 'Click a block to open its file. Bridge blocks show whether they carry the isolation barrier (from the board pack).';
            default: return "Each requirement takes the colour of its latest test records, in simulation and on the bench.";
        }
    }

    // Side panels --------------------------------------------------------

    protected renderSpecification(m: Mission): React.ReactNode {
        const reqs = this.missions.requirements;
        return <>
            <h2>Requirements</h2>
            {this.missions.requirementsProblem && <p className='ownstudio-problem'>{this.missions.requirementsProblem}</p>}
            {!reqs.length && !this.missions.requirementsProblem && <p className='ownstudio-muted'>This mission states no requirements.</p>}
            {reqs.map(r => <div key={r.id} className='ownstudio-card'>
                <div className='ownstudio-card-title'><code>{r.id}</code> {r.title}{r.port && <span className='ownstudio-tag'>{r.port}</span>}</div>
                <div>{r.statement}</div>
                <div className='ownstudio-muted'>{r.verified_by.length ? `Verified by ${r.verified_by.join(', ')}` : 'No test case verifies it yet.'}</div>
            </div>)}
            {m.requirements && <button className='theia-button secondary' onClick={() => this.openFile(m.requirements)}>Open {m.requirements}</button>}
            <h2 className='ownstudio-safety-heading'>Safety envelope</h2>
            <table className='ownstudio-table ownstudio-safety'>
                <thead><tr><th>Port</th><th>V max</th><th>I max</th></tr></thead>
                <tbody>{Object.entries(m.envelope).map(([port, e]) => <tr key={port}>
                    <td>{port}</td><td>{e.v_max_V ?? '—'} V</td><td>{e.i_max_A ?? '—'} A</td></tr>)}</tbody>
            </table>
            <p className='ownstudio-muted'>Teaching profile: indicative, not certification.</p>
        </>;
    }

    protected renderBuild(m: Mission): React.ReactNode {
        const pack = this.missions.board;
        const { link, boards } = this.board;
        const state = this.board.firmware;
        return <>
            <h2>Board</h2>
            <div className='ownstudio-card'>
                <div className='ownstudio-card-title'>{pack?.title ?? m.board.pack} {m.board.version}</div>
                {pack && <div className='ownstudio-muted'>{pack.summary}</div>}
                {this.missions.boardProblem && <div className='ownstudio-problem'>{this.missions.boardProblem}</div>}
            </div>
            <div className='ownstudio-card'>
                {link ? <>
                    <div className='ownstudio-card-title'>
                        <span className={`codicon codicon-${state === 'matches' ? 'pass' : 'warning'} ownstudio-firmware-${state}`} />{' '}
                        {boardName(link.product)} on {link.port}
                    </div>
                    <div>{state === 'matches' ? "Runs this mission's sources." : state === 'prebuilt'
                        ? "Runs this mission's pre-built firmware; the sources have changed since."
                        : state === 'differs' ? 'Runs other sources than this mission.' : 'Its firmware has no build identity to compare.'}</div>
                    {link.build && <div className='ownstudio-muted'>Sources <code>{link.build.rSourceHash}</code>, commit <code>{link.build.rCommit.slice(0, 7)}</code>{link.build.rDirty ? ' (dirty)' : ''}
                        {pack && revisionOf(pack, link.product) && revisionOf(pack, link.product) !== m.board.version
                            ? ` · built for ${revisionOf(pack, link.product)}, the mission expects ${m.board.version}` : ''}</div>}
                </> : <div className='ownstudio-muted'>{boards.length ? `${boardName(boards[0].product)} connected, no ThingSet link.` : 'No board connected. Everything but the bench works without one.'}</div>}
            </div>
            {pack && <>
                <h2>Ratings</h2>
                <table className='ownstudio-table'>
                    <thead><tr><th>Port</th><th>Voltage</th><th>Current</th></tr></thead>
                    <tbody>{Object.entries(pack.ports).map(([port, r]) => <tr key={port}>
                        <td>{port}</td>
                        <td title={r.v_max_V.source + (r.v_max_V.check ? ` (check: ${r.v_max_V.check})` : '')}>{r.v_min_V.value}–{r.v_max_V.value} V</td>
                        <td title={r.i_max_A.source}>≤ {r.i_max_A.value} A</td></tr>)}</tbody>
                </table>
                <p className='ownstudio-muted'>From the {pack.title} board pack (draft). Hover a value for its source.</p>
            </>}
        </>;
    }

    protected renderVerification(verifications: Map<string, Verification>): React.ReactNode {
        const reqs = this.missions.requirements;
        return <>
            <h2>Requirements</h2>
            {reqs.map(r => {
                const v = verifications.get(r.id)!;
                return <div key={r.id} className='ownstudio-card'>
                    <div className='ownstudio-card-title'>
                        <span className={`ownstudio-swatch os-state-${v.state}`} title={STATE_LABEL[v.state]} />
                        <code>{r.id}</code> {STATE_LABEL[v.state]}
                    </div>
                    {this.renderResult('Simulation', v.simulator)}
                    {this.renderResult('Bench', v.board)}
                </div>;
            })}
            <h2>Test records</h2>
            {!this.missions.records.length && <p className='ownstudio-muted'>No records yet: run a test procedure.</p>}
            <ul className='ownstudio-records'>
                {this.missions.records.map(rec => <li key={rec.folder}>
                    <a href='#' onClick={e => { e.preventDefault(); this.openFile(`${rec.folder}/record.md`); }}>{rec.procedure}</a>
                    <span className={`ownstudio-verdict ownstudio-verdict-${rec.verdict.toLowerCase()}`}>{rec.verdict}</span>
                    <div className='ownstudio-muted'>{rec.level} · {rec.target} · {new Date(rec.date).toLocaleString()}</div>
                </li>)}
            </ul>
        </>;
    }

    protected renderResult(label: string, result: TargetResult | undefined): React.ReactNode {
        if (!result) {
            return <div className='ownstudio-muted'>{label}: no record</div>;
        }
        return result.cases.map(c => <div key={label + c.id} className={c.passed ? '' : 'ownstudio-problem'}>
            {label}: {typeof c.measured === 'number' ? c.measured.toPrecision(4) : c.measured} {c.unit} ({c.criterion}) — {c.passed ? 'pass' : 'fail'}
        </div>);
    }

    protected renderLegend(): React.ReactNode {
        return <div className='ownstudio-legend'>
            {STATES.map(s => <span key={s}><span className={`ownstudio-swatch os-state-${s}`} />{STATE_LABEL[s]}</span>)}
        </div>;
    }

    protected renderDiagram(m: Mission, verifications: Map<string, Verification>): React.ReactNode {
        const ports = Object.entries(m.ports);
        const inPort = ports.find(([, p]) => p.direction === 'in') ?? ports[0];
        const outPort = ports.find(([, p]) => p.direction === 'out');
        return <svg className='ownstudio-diagram' viewBox='0 56 760 456' role='img' aria-label={`${m.title}: five converter blocks`}>
            <defs>
                <pattern id='os-hatch' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
                    <rect width='3' height='6' fill='#6C8AFF' /><rect x='3' width='3' height='6' fill='#E5484D' />
                </pattern>
                <marker id='os-arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
                    <path d='M0 0L10 5L0 10z' className='os-arrowhead' />
                </marker>
            </defs>
            <rect x='24' y='216' width='712' height='144' rx='8' className='os-bridge' />
            <text x='40' y='240' className='os-bridge-name'>Bridge blocks</text>
            <g className='os-energy'>
                <path d='M184 124H232' markerStart='url(#os-arrow)' markerEnd='url(#os-arrow)' />
                <path d='M528 124H576' markerStart='url(#os-arrow)' markerEnd='url(#os-arrow)' />
            </g>
            <g className='os-signal'>
                <path d='M250 176V196H190V256' markerEnd='url(#os-arrow)' />
                <path d='M560 256V196H510V176' markerEnd='url(#os-arrow)' />
                <path d='M200 344V372H300V400' markerEnd='url(#os-arrow)' />
                <path d='M460 400V372H560V344' markerEnd='url(#os-arrow)' />
                <path d='M528 444H584' markerStart='url(#os-arrow)' markerEnd='url(#os-arrow)' />
            </g>
            <g className='os-aux'>
                <path d='M380 176V256' markerEnd='url(#os-arrow)' />
                <path d='M276 300H248' markerEnd='url(#os-arrow)' />
                <path d='M484 300H512' markerEnd='url(#os-arrow)' />
                <path d='M380 344V400' markerEnd='url(#os-arrow)' />
            </g>
            <text x='220' y='190' className='os-label' textAnchor='middle'>sensors</text>
            <text x='535' y='190' className='os-label' textAnchor='middle'>gate</text>
            <text x='388' y='208' className='os-label'>takes energy</text>
            <text x='250' y='366' className='os-label' textAnchor='middle'>signals</text>
            <text x='510' y='366' className='os-label' textAnchor='middle'>PWM</text>
            <text x='556' y='434' className='os-label' textAnchor='middle'>ThingSet</text>
            {inPort && this.renderPort(m, inPort[0], inPort[1], ENV_IN, 208, verifications)}
            {outPort && this.renderPort(m, outPort[0], outPort[1], ENV_OUT, 552, verifications)}
            {this.renderBox(OUTSIDE, 'Outside world', 'PC, instruments, networks', 'os-env')}
            {(Object.keys(BOXES) as BlockKey[]).map(key =>
                this.renderBox(BOXES[key], m.blocks[key].title, m.blocks[key].summary,
                    'os-block', m.blocks[key].opens ?? undefined, key))}
            {this.layer === 'build' && this.renderIsolation()}
        </svg>;
    }

    protected renderIsolation(): React.ReactNode {
        const pack = this.missions.board;
        if (!pack) {
            return undefined;
        }
        return BRIDGE_BLOCKS.map((block: BridgeBlock) => {
            const b = BOXES[block];
            const iso = pack.blocks[block];
            return <g key={'iso-' + block} className={`os-isolation ${iso.isolated ? 'os-isolated' : 'os-not-isolated'}`}>
                <title>{`${iso.isolated ? 'Carries the isolation barrier' : 'Not isolated'}: ${iso.parts} (${iso.source})`}</title>
                <rect x={b.x + b.w - 70} y={b.y - 9} width='62' height='18' rx='9' />
                <text x={b.x + b.w - 39} y={b.y + 4} textAnchor='middle'>{iso.isolated ? 'isolated' : 'not isolated'}</text>
            </g>;
        });
    }

    protected renderBadges(name: string, box: Box, verifications: Map<string, Verification>): React.ReactNode {
        const reqs: Requirement[] = this.missions.requirements.filter(r => r.port === name);
        if (!reqs.length || this.layer === 'build') {
            return undefined;
        }
        if (this.layer === 'specification') {
            return <g className='os-req-badge'>
                <title>{reqs.map(r => `${r.id}: ${r.statement}`).join('\n')}</title>
                <rect x={box.x + box.w / 2 - 50} y={box.y + box.h - 30} width='100' height='20' rx='10' />
                <text x={box.x + box.w / 2} y={box.y + box.h - 16} textAnchor='middle'>{reqs.length} requirement{reqs.length > 1 ? 's' : ''}</text>
            </g>;
        }
        const size = 16;
        const start = box.x + box.w / 2 - (reqs.length * (size + 4) - 4) / 2;
        return <g>{reqs.map((r, i) => {
            const state = verifications.get(r.id)?.state ?? 'untested';
            return <g key={r.id}>
                <title>{`${r.id}: ${STATE_LABEL[state]}`}</title>
                <rect x={start + i * (size + 4)} y={box.y + box.h - 28} width={size} height={size} rx='3' className={`os-swatch os-state-${state}`} />
            </g>;
        })}</g>;
    }

    protected renderPort(m: Mission, name: string, port: Port, box: Box, labelX: number,
        verifications: Map<string, Verification>): React.ReactNode {
        const env = this.layer === 'specification' ? m.envelope[name] : undefined;
        const limits = env ? [env.v_max_V !== undefined ? `≤ ${env.v_max_V} V` : '', env.i_max_A !== undefined ? `≤ ${env.i_max_A} A` : '']
            .filter(Boolean).join(' · ') : '';
        return <g key={name}>
            <text x={labelX} y={112} textAnchor='middle' className='os-port'>{name}</text>
            {limits && <text x={box.x + box.w / 2} y={box.y + box.h + 20} textAnchor='middle' className='os-envelope'>{name} {limits}</text>}
            {this.renderBox(box, 'Environment', port.connect, 'os-env')}
            {this.renderBadges(name, box, verifications)}
        </g>;
    }

    protected renderBox(b: Box, title: string, summary: string, kind: string, opens?: string, key?: string): React.ReactNode {
        // About 5.6 units per character at 11 px; lines start 42 below the top, 15 apart.
        const lines = wrap(summary, Math.floor((b.w - 20) / 5.6)).slice(0, Math.floor((b.h - 30) / 15));
        const clickable = !!opens;
        return <g key={key ?? title + b.x} className={`${kind}${clickable ? ' os-clickable' : ''}`}
            onClick={clickable ? () => this.openFile(opens) : undefined}>
            {clickable && <title>{`Open ${opens}`}</title>}
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx='8' />
            <text x={b.x + b.w / 2} y={b.y + 24} textAnchor='middle' className='os-name'>{title}</text>
            {lines.map((line, i) =>
                <text key={i} x={b.x + b.w / 2} y={b.y + 42 + 15 * i} textAnchor='middle' className='os-summary'>{line}</text>)}
        </g>;
    }
}
