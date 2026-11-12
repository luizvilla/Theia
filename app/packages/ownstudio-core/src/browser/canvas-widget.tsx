// SPDX-License-Identifier: LGPL-2.1-only
// The setup canvas (plan U8, ADR 0026, SPEC §6, storyboard frames 2, 3, 6b),
// drawn with React Flow (choice S1). Parts are dropped from the Parts panel;
// wires follow the topology rules of common/canvas-model.ts, and a refused
// wire says why. The canvas is ownstudio/setup.yaml's canvas section: saved at
// once, committed as a timeline dot after 10 s without change or when the
// canvas is left (choice S6). The same widget sits under every workbench,
// tinted by it.
import '@xyflow/react/dist/style.css';
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry, Emitter } from '@theia/core/lib/common';
import { ApplicationShell } from '@theia/core/lib/browser';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    Background, Connection, ConnectionMode, Edge, Handle, Node, NodeChange, NodeProps, Position, ReactFlow, ReactFlowInstance,
    ReactFlowProvider, applyNodeChanges
} from '@xyflow/react';
import { BOTTOM_SLOTS, CANVAS_TINT, WORKBENCH_SLOTS, WorkbenchId } from '../common/window-layout.js';
import { Canvas, PartDef, addPart, canConnect, normaliseCanvas, partDef } from '../common/canvas-model.js';
import { InsideBlockId, InsideModel, insideModel } from '../common/inside-model.js';
import { BoardDefinition, SetupService } from '../common/setup-protocol.js';
import { WORKBENCHES, commandId, iconClass } from './workbenches.js';
import { InspectorAction, InspectorWidget } from './window-widgets.js';
import { BuildService } from '../common/build-protocol.js';
import { eng } from '../common/units.js';
import { TimelineModel } from './timeline-model.js';

export const PART_MIME = 'application/ownstudio-part';
const COMMIT_AFTER_MS = 10_000;

type PartData = { def: PartDef; values: Record<string, number>; selected?: boolean; firmware?: string };

function PartNode({ data, selected }: NodeProps<Node<PartData>>): React.ReactElement {
    const { def, values } = data;
    const left = def.ports.filter(p => p.side === 'left');
    const right = def.ports.filter(p => p.side === 'right');
    const at = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`;
    return <div className={'ownstudio-node' + (selected ? ' ownstudio-node-selected' : '')} data-node-part={def.part}>
        <div className='ownstudio-node-head' style={{ background: def.colour }}>{def.label}</div>
        <div className='ownstudio-node-rows'>
            {def.values.map(v => <div key={v.key} data-value={v.key}><span>{v.label}</span><b>{eng(values[v.key] ?? v.default, v.unit)}</b></div>)}
            {def.kind === 'board' && <div className='ownstudio-node-ports'><span>HIGH</span><span>LOW1 · LOW2</span></div>}
            {def.kind === 'board' && data.firmware && <div className='ownstudio-node-firmware'>{data.firmware}</div>}
        </div>
        {left.map((p, i) => <Handle key={p.id} id={p.id} type='source' position={Position.Left} style={{ top: at(i, left.length) }}
            className='ownstudio-port' title={p.label} />)}
        {right.map((p, i) => <Handle key={p.id} id={p.id} type='source' position={Position.Right} style={{ top: at(i, right.length) }}
            className={'ownstudio-port' + (p.id === 'LOW2' ? ' ownstudio-port-open' : '')} title={p.label} />)}
    </div>;
}
const NODE_TYPES = { part: PartNode };

@injectable()
export class CanvasWidget extends ReactWidget {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(InspectorWidget) protected readonly inspector: InspectorWidget;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(BuildService) protected readonly builds: BuildService;
    @inject(TimelineModel) protected readonly timeline: TimelineModel;

    protected readonly slot = BOTTOM_SLOTS[0];
    protected workbench: WorkbenchId = 'code';
    protected folder: string | undefined;
    protected canvas: Canvas = { nodes: [], wires: [] };
    protected definition: BoardDefinition | undefined;
    protected inside: InsideModel | undefined;
    protected level: 'setup' | 'inside' = 'setup';
    protected insideSelection: InsideBlockId | undefined;
    protected rfNodes: Node<PartData>[] = [];
    protected selected: string | undefined;
    protected firmware: string | undefined;
    protected refusal = '';
    protected refusalTimer: ReturnType<typeof setTimeout> | undefined;
    protected pendingSummary: string | undefined;
    protected commitTimer: ReturnType<typeof setTimeout> | undefined;
    /** Keep writes and their event commits in order when the user moves quickly between workbenches. */
    protected persistence: Promise<void> = Promise.resolve();
    protected flow: ReactFlowInstance<Node<PartData>, Edge> | undefined;
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.id = this.slot.widgetId;
        this.title.label = this.slot.label;
        this.title.caption = this.slot.tooltip;
        this.title.iconClass = iconClass(this.slot.icon);
        this.title.closable = false;
        this.addClass('ownstudio-panel');
        this.node.tabIndex = 0;
        this.load();
        this.update();
        // U18: a restore or a branch moves the setup under the canvas.
        this.timeline.onWillMove(event => event.waitUntil(this.flushPending()));
        this.timeline.onDidMove(event => event.waitUntil(this.reload()));
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    /** Leaving the canvas commits what is pending (S6). */
    protected override onAfterHide(msg: Message): void {
        super.onAfterHide(msg);
        this.commitNow();
    }

    setWorkbench(workbench: WorkbenchId): void {
        if (workbench !== this.workbench) {
            this.commitNow();
        }
        this.workbench = workbench;
        this.node.style.setProperty('--ownstudio-canvas', CANVAS_TINT[workbench]);
        this.node.dataset.workbench = workbench;
        this.update();
    }

    protected async load(): Promise<void> {
        const roots = await this.workspace.roots;
        const folder = roots[0]?.resource.path.fsPath();
        if (!folder || !await this.setups.isSetup(folder)) {
            return;
        }
        this.folder = folder;
        const [canvas, definition, built] = await Promise.all([
            this.setups.readCanvas(folder),
            this.setups.boardDefinition(folder).catch(error => {
                console.error('board inside not loaded', error);
                return undefined;
            }),
            this.builds.lastBuild(folder).catch(() => undefined),
        ]);
        this.canvas = normaliseCanvas(canvas);
        this.definition = definition;
        this.inside = definition ? insideModel(definition) : undefined;
        this.firmware = built ? `${built.identity.source_hash} ✓` : undefined;
        // The board of a new setup has no place yet: put it in the middle.
        this.canvas.nodes = this.canvas.nodes.map(n => n.x === undefined ? { ...n, x: 300, y: 40 } : n);
        this.syncNodes();
        this.update();
        this.onDidChangeEmitter.fire();
    }

    /** U18: commit pending canvas edits now and wait for every write (before a restore). */
    async flushPending(): Promise<void> {
        this.commitNow();
        await this.persistence;
    }

    /** U18: the setup changed under the canvas (a restore, a branch): read it again after our own writes. */
    async reload(): Promise<void> {
        await this.persistence;
        clearTimeout(this.commitTimer);
        this.pendingSummary = undefined;
        await this.load();
    }

    /** For tests and the inspector: the canvas as it is now. */
    get model(): Canvas { return this.canvas; }
    get boardDefinition(): BoardDefinition | undefined { return this.definition; }

    /** U14: reflect a plant save without treating the external edit as another canvas edit. */
    replaceFromPlant(raw: unknown): void {
        this.canvas = normaliseCanvas(raw);
        this.syncNodes();
        if (this.selected) {
            this.select(this.selected);
        }
        this.update();
        this.onDidChangeEmitter.fire();
    }

    /**
     * U16: the Design sheets change the board's values through the canvas, the one
     * writer of setup.yaml's canvas; the plant reads them by name (L, C). Earlier
     * canvas edits are committed first, then the change is saved and committed
     * as its own `design` dot, so the timeline says what the designer chose.
     */
    setBoardValues(values: Record<string, number>, summary: string): Promise<void> {
        const board = this.canvas.nodes.find(n => partDef(n.part)?.kind === 'board');
        if (!board) {
            return Promise.reject(new Error('The setup has no board on its canvas.'));
        }
        const current = board.values ?? {};
        if (Object.entries(values).every(([key, value]) => current[key] === value)) {
            return this.persistence;
        }
        this.commitNow();
        this.canvas = { ...this.canvas, nodes: this.canvas.nodes.map(n => n === board ? { ...n, values: { ...current, ...values } } : n) };
        this.syncNodes();
        if (this.selected === board.id) {
            this.select(board.id);
        }
        this.update();
        this.onDidChangeEmitter.fire();
        const folder = this.folder;
        if (folder) {
            const snapshot = this.canvas;
            this.enqueuePersistence(() => this.setups.writeCanvas(folder, snapshot), 'canvas not saved');
            this.enqueuePersistence(() => this.setups.commitEvent(folder, 'design', `design: ${summary}`), 'design not committed');
        }
        return this.persistence;
    }

    protected syncNodes(): void {
        this.rfNodes = this.canvas.nodes.flatMap(n => {
            const def = partDef(n.part);
            return def ? [{
                id: n.id, type: 'part', position: { x: n.x ?? 0, y: n.y ?? 0 }, selected: n.id === this.selected,
                data: { def, values: n.values ?? {}, firmware: this.firmware },
            }] : [];
        });
    }

    /** U10: the build identity follows the board on the canvas. */
    setFirmware(label: string | undefined): void {
        this.firmware = label;
        this.syncNodes();
        this.update();
    }

    protected changed(next: Canvas, summary: string): void {
        this.canvas = next;
        this.syncNodes();
        this.update();
        this.onDidChangeEmitter.fire();
        if (!this.folder) {
            return;
        }
        const folder = this.folder;
        const snapshot = this.canvas;
        this.enqueuePersistence(() => this.setups.writeCanvas(folder, snapshot), 'canvas not saved');
        this.pendingSummary = this.pendingSummary ? `${this.pendingSummary}; ${summary}` : summary;
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => this.commitNow(), COMMIT_AFTER_MS);
    }

    protected enqueuePersistence(operation: () => Promise<void>, failure: string): void {
        this.persistence = this.persistence.then(operation).catch(e => console.error(failure, e));
    }

    protected commitNow(): void {
        clearTimeout(this.commitTimer);
        if (!this.pendingSummary || !this.folder) {
            return;
        }
        const folder = this.folder;
        const summary = `canvas: ${this.pendingSummary}`;
        this.pendingSummary = undefined;
        this.enqueuePersistence(() => this.setups.commitEvent(folder, 'canvas', summary), 'canvas not committed');
    }

    protected refuse(reason: string): void {
        this.refusal = reason;
        clearTimeout(this.refusalTimer);
        this.refusalTimer = setTimeout(() => { this.refusal = ''; this.update(); }, 4000);
        this.update();
    }

    protected onDrop = (event: React.DragEvent) => {
        const part = event.dataTransfer.getData(PART_MIME);
        if (!part) {
            return;
        }
        event.preventDefault();
        const at = this.flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 40, y: 40 };
        const result = addPart(this.canvas, part, at.x, at.y);
        if ('reason' in result) {
            this.refuse(result.reason);
            return;
        }
        this.changed(result.canvas, `${partDef(part)!.label} added`);
    };

    protected onDragOver = (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(PART_MIME)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    protected endOf = (c: Connection | Edge) => ({
        a: { node: c.source, port: c.sourceHandle ?? '' },
        b: { node: c.target, port: c.targetHandle ?? '' },
    });

    protected isValidConnection = (c: Connection | Edge) => {
        const { a, b } = this.endOf(c);
        const verdict = canConnect(this.canvas, a, b);
        if (!verdict.ok) {
            this.refusal = verdict.reason;      // shown if the wire is dropped there
        }
        return verdict.ok;
    };

    protected onConnect = (c: Connection) => {
        const { a, b } = this.endOf(c);
        if (!canConnect(this.canvas, a, b).ok) {
            return;
        }
        this.refusal = '';
        const label = (id: string) => partDef(this.canvas.nodes.find(n => n.id === id)?.part ?? '')?.label ?? id;
        this.changed({ ...this.canvas, wires: [...this.canvas.wires, { from: a, to: b }] }, `${label(a.node)} wired to ${label(b.node)}`);
    };

    protected onConnectEnd = () => {
        if (this.refusal) {
            this.refuse(this.refusal);
        }
    };

    protected onNodesChange = (changes: NodeChange<Node<PartData>>[]) => {
        this.rfNodes = applyNodeChanges(changes, this.rfNodes);
        for (const ch of changes) {
            if (ch.type === 'select' && ch.selected) {
                this.select(ch.id);
            }
        }
        this.update();
    };

    protected onNodeDragStop = (_: unknown, node: Node<PartData>) => {
        const next = { ...this.canvas, nodes: this.canvas.nodes.map(n => n.id === node.id ? { ...n, x: Math.round(node.position.x), y: Math.round(node.position.y) } : n) };
        this.changed(next, `${node.data.def.label} moved`);
    };

    protected select(id: string): void {
        this.selected = id;
        const node = this.canvas.nodes.find(n => n.id === id);
        const def = node && partDef(node.part);
        if (node && def) {
            this.inspector.select(def.label, def.values.map(v => [v.label, eng(node.values?.[v.key] ?? v.default, v.unit)]));
        }
    }

    protected openInside = (_event: React.MouseEvent, node: Node<PartData>): void => {
        if (node.data.def.kind !== 'board') {
            return;
        }
        if (!this.inside) {
            this.refuse('The board has no inside view.');
            return;
        }
        this.level = 'inside';
        this.selected = undefined;
        this.syncNodes();
        this.insideSelection = undefined;
        this.inspector.select(undefined);
        this.update();
    };

    protected closeInside = (): void => {
        this.level = 'setup';
        this.insideSelection = undefined;
        if (this.selected) {
            this.select(this.selected);
        } else {
            this.inspector.select(undefined);
        }
        this.update();
    };

    protected actions(): InspectorAction[] {
        const action = (label: string, workbench: WorkbenchId): InspectorAction => ({
            label,
            run: () => {
                const target = WORKBENCHES.find(candidate => candidate.id === workbench)!;
                void this.commands.executeCommand(commandId(target));
            },
        });
        return [action('Design', 'design'), action('Code', 'code'), action('Tests', 'lab')];
    }

    protected selectInside = (id: InsideBlockId): void => {
        const block = this.inside?.blocks.find(candidate => candidate.id === id);
        if (!block) {
            return;
        }
        this.insideSelection = id;
        this.inspector.select(block.label, block.details, this.actions());
        this.shell.expandPanel('right');
        this.shell.rightPanelHandler.activate(this.inspector.id);
        this.update();
    };

    protected renderInside(label: string | undefined): React.ReactNode {
        const model = this.inside!;
        const signal = (from: InsideBlockId, to: InsideBlockId) => model.signals.find(item => item[0] === from && item[1] === to)?.[2] ?? '';
        return <div className='ownstudio-canvas ownstudio-canvas-inside' data-canvas-level='inside'
            data-selected-block={this.insideSelection ?? ''}>
            <div className='ownstudio-inside-breadcrumb'><button onClick={this.closeInside}>Setup</button><span>›</span>
                <b>{model.boardLabel}</b><span>› inside</span></div>
            <div className='ownstudio-inside-side ownstudio-inside-power'><span>POWER SIDE · power ground</span></div>
            <div className='ownstudio-inside-side ownstudio-inside-control'><span>CONTROL SIDE · digital ground</span></div>
            <svg className='ownstudio-inside-signals' viewBox='0 0 1000 300' preserveAspectRatio='none' aria-hidden='true'>
                <defs>
                    <marker id='ownstudio-signal-arrow' markerWidth='9' markerHeight='9' refX='7' refY='4.5' orient='auto'>
                        <path d='M0 0 L9 4.5 L0 9z' fill='#6bb3e3' />
                    </marker>
                    <marker id='ownstudio-energy-arrow' markerWidth='9' markerHeight='9' refX='7' refY='4.5' orient='auto'>
                        <path d='M0 0 L9 4.5 L0 9z' fill='#f08a4b' />
                    </marker>
                </defs>
                {model.isolation && <><path className='ownstudio-isolation' d='M330 300 L650 0' />
                    <text x='660' y='18' className='ownstudio-inside-svg-label'>isolation barrier</text></>}
                <path className='ownstudio-signal' d='M320 68 H680' />
                <text x='420' y='55' className='ownstudio-inside-svg-label'>{signal('power', 'measurement')}</text>
                <path className='ownstudio-signal' d='M790 96 V214' />
                <text x='802' y='155' className='ownstudio-inside-svg-label'>{signal('measurement', 'controller')}</text>
                <path className='ownstudio-signal' d='M680 240 H320' />
                <text x='475' y='264' className='ownstudio-inside-svg-label'>{signal('controller', 'driver')}</text>
                <path className='ownstudio-signal' d='M210 214 V96' />
                <text x='222' y='155' className='ownstudio-inside-svg-label'>{signal('driver', 'power')}</text>
                <path className='ownstudio-energy' d='M455 135 L325 88' />
                <path className='ownstudio-energy' d='M545 135 L675 88' />
                <path className='ownstudio-energy' d='M455 166 L325 220' />
                <path className='ownstudio-energy' d='M545 166 L675 220' />
            </svg>
            {model.blocks.map(block => <button key={block.id} data-block={block.id}
                className={'ownstudio-inside-block' + (this.insideSelection === block.id ? ' selected' : '')}
                style={{ left: `${8 + block.at[0] * 58}%`, top: `${18 + block.at[1] * 50}%` }}
                onClick={() => this.selectInside(block.id)}>
                {block.label}
                {block.id === 'power' && <small>{model.ports.join(' · ')}</small>}
            </button>)}
            <span className='ownstudio-canvas-label'>{label}</span>
        </div>;
    }

    protected render(): React.ReactNode {
        const label = WORKBENCH_SLOTS.find(w => w.id === this.workbench)?.label;
        if (!this.folder) {
            return <div className='ownstudio-canvas'>
                <div className='ownstudio-canvas-empty'>
                    <div className='ownstudio-panel-head'>Setup canvas</div>
                    <p className='ownstudio-muted'>The setup's source, Twist and load appear here, the same in every workbench.</p>
                </div>
                <span className='ownstudio-canvas-label'>{label}</span>
            </div>;
        }
        if (this.level === 'inside' && this.inside) {
            return this.renderInside(label);
        }
        const edges: Edge[] = this.canvas.wires.map((w, i) => ({
            id: `w${i}`, source: w.from.node, sourceHandle: w.from.port, target: w.to.node, targetHandle: w.to.port, className: 'ownstudio-wire',
        }));
        return <div className='ownstudio-canvas' onDrop={this.onDrop} onDragOver={this.onDragOver} data-node-count={this.canvas.nodes.length}
            data-canvas-level='setup' data-selected-block={this.selected ?? ''}>
            <ReactFlowProvider>
                <ReactFlow<Node<PartData>, Edge> nodes={this.rfNodes} edges={edges} nodeTypes={NODE_TYPES}
                    connectionMode={ConnectionMode.Loose} isValidConnection={this.isValidConnection}
                    onConnect={this.onConnect} onConnectStart={() => { this.refusal = ''; }} onConnectEnd={this.onConnectEnd} onNodesChange={this.onNodesChange}
                    onNodeDragStop={this.onNodeDragStop} onNodeDoubleClick={this.openInside} onInit={flow => { this.flow = flow; }}
                    fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }} minZoom={0.3} maxZoom={2}
                    proOptions={{ hideAttribution: true }} deleteKeyCode={null}>
                    <Background gap={18} size={1} color='rgba(255,255,255,0.12)' />
                </ReactFlow>
            </ReactFlowProvider>
            <span className='ownstudio-canvas-mapping'>src/main.cpp · setup_routine()</span>
            {this.refusal && <div className='ownstudio-canvas-refusal' role='status'>{this.refusal}</div>}
            <span className='ownstudio-canvas-label'>{label}</span>
        </div>;
    }
}
