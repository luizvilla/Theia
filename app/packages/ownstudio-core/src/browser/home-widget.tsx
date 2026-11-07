// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { BlockKey, Mission, Port, parseMission, wrap } from './mission';
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

/** Home: the opened mission's converter, drawn as its five blocks (Build layer). */
@injectable()
export class HomeWidget extends ReactWidget {

    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(FileService) protected readonly files: FileService;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected mission: Mission | undefined;
    protected root: URI | undefined;
    protected problem = 'Opening…';

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
        this.workspace.onWorkspaceChanged(() => this.load());
        this.load();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async load(): Promise<void> {
        const roots = await this.workspace.roots;
        this.root = roots[0]?.resource;
        this.mission = undefined;
        if (!this.root) {
            this.problem = 'Open a mission folder (File › Open Folder) to see its converter here.';
        } else {
            const uri = this.root.resolve('mission.yaml');
            try {
                this.mission = parseMission((await this.files.read(uri)).value);
            } catch (error) {
                this.problem = (await this.files.exists(uri))
                    ? `mission.yaml could not be read: ${error instanceof Error ? error.message : error}`
                    : 'This folder has no mission.yaml. Open a mission folder to see its converter here.';
            }
        }
        this.update();
    }

    protected openFile(path: string | null | undefined): void {
        if (path && this.root) {
            open(this.opener, this.root.resolve(path));
        }
    }

    protected render(): React.ReactNode {
        const m = this.mission;
        if (!m) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>Home</h1>
                <p className='ownstudio-workbench-purpose'>{this.problem}</p>
            </div>;
        }
        return <div className='ownstudio-workbench-body ownstudio-home-body'>
            <h1 className='ownstudio-emphasis ownstudio-mission-title'>{m.title}</h1>
            <p className='ownstudio-workbench-purpose'>{m.summary}</p>
            <div className='ownstudio-layer-tabs'>
                <span className='ownstudio-layer' title='Requirements and safety: next step'>Specification</span>
                <span className='ownstudio-layer ownstudio-layer-active'>Build</span>
                <span className='ownstudio-layer' title='Test records: next step'>Verification</span>
                <span className='ownstudio-board'>{m.board.pack} {m.board.version}</span>
            </div>
            {this.renderDiagram(m)}
            <p className='ownstudio-home-note'>Click a block to open its file. Red numbers are the mission's safety envelope at each port.</p>
        </div>;
    }

    protected renderDiagram(m: Mission): React.ReactNode {
        const ports = Object.entries(m.ports);
        const inPort = ports.find(([, p]) => p.direction === 'in') ?? ports[0];
        const outPort = ports.find(([, p]) => p.direction === 'out');
        return <svg className='ownstudio-diagram' viewBox='0 56 760 456' role='img' aria-label={`${m.title}: five converter blocks`}>
            <defs>
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
            {inPort && this.renderPort(m, inPort[0], inPort[1], ENV_IN, 208)}
            {outPort && this.renderPort(m, outPort[0], outPort[1], ENV_OUT, 552)}
            {this.renderBox(OUTSIDE, 'Outside world', 'PC, instruments, networks', 'os-env')}
            {(Object.keys(BOXES) as BlockKey[]).map(key =>
                this.renderBox(BOXES[key], m.blocks[key].title, m.blocks[key].summary,
                    'os-block', m.blocks[key].opens ?? undefined, key))}
        </svg>;
    }

    protected renderPort(m: Mission, name: string, port: Port, box: Box, labelX: number): React.ReactNode {
        const env = m.envelope[name];
        const limits = env ? [env.v_max_V !== undefined ? `≤ ${env.v_max_V} V` : '', env.i_max_A !== undefined ? `≤ ${env.i_max_A} A` : '']
            .filter(Boolean).join(' · ') : '';
        return <g key={name}>
            <text x={labelX} y={112} textAnchor='middle' className='os-port'>{name}</text>
            {limits && <text x={box.x + box.w / 2} y={box.y + box.h + 20} textAnchor='middle' className='os-envelope'>{name} {limits}</text>}
            {this.renderBox(box, 'Environment', port.connect, 'os-env')}
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
