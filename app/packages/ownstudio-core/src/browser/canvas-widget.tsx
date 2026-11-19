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
import { Canvas, PartDef, addPart, canConnect, normaliseCanvas, partDef, withBenchSourceAndLoad } from '../common/canvas-model.js';
import { INSIDE_VIEW, InsideBlockId, InsideModel, insideLayout, insideModel } from '../common/inside-model.js';
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
    protected keysActive = false;

    protected setKeysActive(active: boolean): void {
        if (this.keysActive !== active) {
            this.keysActive = active;
            this.update();
        }
    }
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
        // F15: React Flow listens for its keys on the whole document and takes Monaco's new input
        // element (Electron 44's EditContext) for something other than a text field, so it ate
        // every Space typed in the AI prompt. Its keys act only while the canvas has the focus.
        this.node.addEventListener('focusin', () => this.setKeysActive(true));
        this.node.addEventListener('focusout', event => {
            if (!this.node.contains(event.relatedTarget as globalThis.Node | null)) {
                this.setKeysActive(false);
            }
        });
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

    /**
     * U18: commit pending canvas edits now and wait for every write (before a restore).
     * F2: `exclude` leaves paths for the event that owns them (a PulsimGui save of the plant).
     */
    async flushPending(exclude: string[] = []): Promise<void> {
        this.commitNow(exclude);
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

    protected commitNow(exclude: string[] = []): void {
        clearTimeout(this.commitTimer);
        if (!this.pendingSummary || !this.folder) {
            return;
        }
        const folder = this.folder;
        const summary = `canvas: ${this.pendingSummary}`;
        this.pendingSummary = undefined;
        this.enqueuePersistence(() => this.setups.commitEvent(folder, 'canvas', summary, exclude), 'canvas not committed');
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
        event.stopPropagation();
        const at = this.flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 40, y: 40 };
        this.addPartAt(part, at);
    };

    /**
     * F1 (Q176): adds a part, at a point or at its default spot beside the board: a source
     * to its left (HIGH), loads to its right (LOW1), one under the other. Returns the
     * refusal sentence, shown on the canvas too, or undefined when the part was added.
     */
    addPartAt(part: string, at?: { x: number; y: number }): string | undefined {
        const result = addPart(this.canvas, part, (at ?? this.defaultSpot(part)).x, (at ?? this.defaultSpot(part)).y);
        if ('reason' in result) {
            this.refuse(result.reason);
            return result.reason;
        }
        this.changed(result.canvas, `${partDef(part)!.label} added`);
        if (!at) {      // placed out of sight, perhaps: bring the whole setup into view
            setTimeout(() => this.flow?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 200 }), 50);
        }
        return undefined;
    }

    /** F3 (Q173b): the bench's 30 V source on HIGH and 33 Ω on LOW1, wired, as one canvas dot. */
    addBenchSourceAndLoad(): void {
        const next = withBenchSourceAndLoad(this.canvas, (part, canvas) => this.defaultSpot(part, canvas));
        if (next !== this.canvas) {
            this.changed(next, 'bench source and load');
            setTimeout(() => this.flow?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 200 }), 50);
        }
    }

    protected defaultSpot(part: string, canvas: Canvas = this.canvas): { x: number; y: number } {
        const kind = partDef(part)?.kind;
        const board = canvas.nodes.find(n => partDef(n.part)?.kind === 'board');
        const bx = board?.x ?? 300, by = board?.y ?? 40;
        const same = canvas.nodes.filter(n => partDef(n.part)?.kind === kind).length;
        if (kind === 'source') {
            return { x: bx - 260, y: by + 30 * same };
        }
        if (kind === 'load') {
            return { x: bx + 340, y: by + 120 * same };
        }
        return { x: bx, y: by + 220 };
    }

    /**
     * Accepts a part on dragenter and dragover. Theia's frontend sets `dropEffect = 'none'` on the
     * whole document (frontend-application.js) after this handler, which makes Chromium cancel
     * the drop; stopping the event here keeps the 'copy'. Hand-built DragEvents never showed it.
     */
    protected onDragOver = (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(PART_MIME)) {
            event.preventDefault();
            event.stopPropagation();
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
        // F10: one coordinate system for blocks, arrows and sides, scaled uniformly (see insideLayout).
        const layout = insideLayout(model);
        const path = (points: [number, number][]) => 'M' + points.map(([x, y]) => `${x} ${y}`).join(' L');
        const { power, control } = layout.sides;
        return <div className='ownstudio-canvas ownstudio-canvas-inside' data-canvas-level='inside'
            data-selected-block={this.insideSelection ?? ''}>
            <div className='ownstudio-inside-breadcrumb'><button onClick={this.closeInside}>Setup</button><span>›</span>
                <b>{model.boardLabel}</b><span>› inside</span></div>
            <svg className='ownstudio-inside-view' viewBox={`0 0 ${INSIDE_VIEW.width} ${INSIDE_VIEW.height}`}
                preserveAspectRatio='xMidYMid meet'>
                <defs>
                    <marker id='ownstudio-signal-arrow' markerWidth='8' markerHeight='8' refX='8' refY='4' orient='auto' markerUnits='userSpaceOnUse'>
                        <path d='M0 0 L8 4 L0 8z' fill='#6bb3e3' />
                    </marker>
                    <marker id='ownstudio-energy-arrow' markerWidth='8' markerHeight='8' refX='8' refY='4' orient='auto' markerUnits='userSpaceOnUse'>
                        <path d='M0 0 L8 4 L0 8z' fill='#f08a4b' />
                    </marker>
                </defs>
                <rect className='ownstudio-inside-side ownstudio-inside-power' x={power.x} y={power.y} width={power.width} height={power.height} rx='8' />
                <text className='ownstudio-inside-side-label ownstudio-inside-power' x={power.x + 10} y={power.y + 14}>POWER SIDE · power ground</text>
                <rect className='ownstudio-inside-side ownstudio-inside-control' x={control.x} y={control.y} width={control.width} height={control.height} rx='8' />
                <text className='ownstudio-inside-side-label ownstudio-inside-control' x={control.x + control.width - 10} y={control.y + 14}
                    textAnchor='end'>CONTROL SIDE · digital ground</text>
                {layout.barrier && <g data-barrier>
                    <line className='ownstudio-isolation' x1={layout.barrier[0]} y1={layout.barrier[1]} x2={layout.barrier[2]} y2={layout.barrier[3]} />
                    <text className='ownstudio-inside-svg-label' x={layout.barrier[0]} y={layout.barrier[1] - 8} textAnchor='middle'>isolation barrier</text>
                </g>}
                {layout.energy.map(arrow => <path key={`e-${arrow.to}`} className='ownstudio-energy' data-energy={arrow.to} d={path(arrow.points)} />)}
                {layout.signals.map(arrow => <g key={`s-${arrow.from}-${arrow.to}`}>
                    <path className='ownstudio-signal' data-signal={`${arrow.from}-${arrow.to}`} d={path(arrow.points)} />
                    {arrow.label && arrow.labelAt && <text className='ownstudio-inside-svg-label' x={arrow.labelAt[0]} y={arrow.labelAt[1]}
                        textAnchor='start'>{arrow.label}</text>}
                </g>)}
                {layout.blocks.map(rect => {
                    const block = model.blocks.find(b => b.id === rect.id)!;
                    return <g key={rect.id} data-block={rect.id} role='button'
                        className={'ownstudio-inside-block' + (this.insideSelection === rect.id ? ' selected' : '')}
                        onClick={() => this.selectInside(rect.id)}>
                        <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx='8' />
                        <text className='ownstudio-inside-block-label' x={rect.x + 14} y={rect.y + rect.height / 2 + 5}>{block.label}</text>
                        {block.id === 'power' && <text className='ownstudio-inside-block-ports' x={rect.x + rect.width - 12}
                            y={rect.y + rect.height / 2 + 4} textAnchor='end'>{model.ports.join(' · ')}</text>}
                    </g>;
                })}
            </svg>
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
        return <div className='ownstudio-canvas' onDrop={this.onDrop} onDragEnter={this.onDragOver} onDragOver={this.onDragOver} data-node-count={this.canvas.nodes.length}
            data-canvas-level='setup' data-selected-block={this.selected ?? ''}>
            <ReactFlowProvider>
                <ReactFlow<Node<PartData>, Edge> nodes={this.rfNodes} edges={edges} nodeTypes={NODE_TYPES}
                    connectionMode={ConnectionMode.Loose} isValidConnection={this.isValidConnection}
                    onConnect={this.onConnect} onConnectStart={() => { this.refusal = ''; }} onConnectEnd={this.onConnectEnd} onNodesChange={this.onNodesChange}
                    onNodeDragStop={this.onNodeDragStop} onNodeDoubleClick={this.openInside} onInit={flow => { this.flow = flow; }}
                    fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }} minZoom={0.3} maxZoom={2}
                    proOptions={{ hideAttribution: true }} deleteKeyCode={null}
                    panActivationKeyCode={this.keysActive ? 'Space' : null} selectionKeyCode={this.keysActive ? 'Shift' : null}
                    multiSelectionKeyCode={this.keysActive ? 'Control' : null} zoomActivationKeyCode={this.keysActive ? 'Control' : null}>
                    <Background gap={18} size={1} color='rgba(255,255,255,0.12)' />
                </ReactFlow>
            </ReactFlowProvider>
            <span className='ownstudio-canvas-mapping'>src/main.cpp · setup_routine()</span>
            {this.refusal && <div className='ownstudio-canvas-refusal' role='status'>{this.refusal}</div>}
            <span className='ownstudio-canvas-label'>{label}</span>
        </div>;
    }
}
