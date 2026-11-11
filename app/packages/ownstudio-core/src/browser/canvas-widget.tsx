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
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    Background, Connection, ConnectionMode, Edge, Handle, Node, NodeChange, NodeProps, Position, ReactFlow, ReactFlowInstance,
    ReactFlowProvider, applyNodeChanges
} from '@xyflow/react';
import { BOTTOM_SLOTS, CANVAS_TINT, WORKBENCH_SLOTS, WorkbenchId } from '../common/window-layout';
import { Canvas, PartDef, addPart, canConnect, normaliseCanvas, partDef } from '../common/canvas-model';
import { SetupService } from '../common/setup-protocol';
import { iconClass } from './workbenches';
import { InspectorWidget } from './window-widgets';

export const PART_MIME = 'application/ownstudio-part';
const COMMIT_AFTER_MS = 10_000;

type PartData = { def: PartDef; values: Record<string, number>; selected?: boolean };

function PartNode({ data, selected }: NodeProps<Node<PartData>>): React.ReactElement {
    const { def, values } = data;
    const left = def.ports.filter(p => p.side === 'left');
    const right = def.ports.filter(p => p.side === 'right');
    const at = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`;
    return <div className={'ownstudio-node' + (selected ? ' ownstudio-node-selected' : '')} data-node-part={def.part}>
        <div className='ownstudio-node-head' style={{ background: def.colour }}>{def.label}</div>
        <div className='ownstudio-node-rows'>
            {def.values.map(v => <div key={v.key}><span>{v.label}</span><b>{values[v.key] ?? v.default} {v.unit}</b></div>)}
            {def.kind === 'board' && <div className='ownstudio-node-ports'><span>HIGH</span><span>LOW1 · LOW2</span></div>}
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

    protected readonly slot = BOTTOM_SLOTS[0];
    protected workbench: WorkbenchId = 'code';
    protected folder: string | undefined;
    protected canvas: Canvas = { nodes: [], wires: [] };
    protected rfNodes: Node<PartData>[] = [];
    protected selected: string | undefined;
    protected refusal = '';
    protected refusalTimer: ReturnType<typeof setTimeout> | undefined;
    protected pendingSummary: string | undefined;
    protected commitTimer: ReturnType<typeof setTimeout> | undefined;
    /** Keep writes and their event commits in order when the user moves quickly between workbenches. */
    protected persistence: Promise<void> = Promise.resolve();
    protected flow: ReactFlowInstance<Node<PartData>, Edge> | undefined;

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
        this.canvas = normaliseCanvas(await this.setups.readCanvas(folder));
        // The board of a new setup has no place yet: put it in the middle.
        this.canvas.nodes = this.canvas.nodes.map(n => n.x === undefined ? { ...n, x: 300, y: 40 } : n);
        this.syncNodes();
        this.update();
    }

    /** For tests and the inspector: the canvas as it is now. */
    get model(): Canvas { return this.canvas; }

    protected syncNodes(): void {
        this.rfNodes = this.canvas.nodes.flatMap(n => {
            const def = partDef(n.part);
            return def ? [{
                id: n.id, type: 'part', position: { x: n.x ?? 0, y: n.y ?? 0 }, selected: n.id === this.selected,
                data: { def, values: n.values ?? {} },
            }] : [];
        });
    }

    protected changed(next: Canvas, summary: string): void {
        this.canvas = next;
        this.syncNodes();
        this.update();
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
            this.inspector.select(def.label, def.values.map(v => [v.label, `${node.values?.[v.key] ?? v.default} ${v.unit}`]));
        }
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
        const edges: Edge[] = this.canvas.wires.map((w, i) => ({
            id: `w${i}`, source: w.from.node, sourceHandle: w.from.port, target: w.to.node, targetHandle: w.to.port, className: 'ownstudio-wire',
        }));
        return <div className='ownstudio-canvas' onDrop={this.onDrop} onDragOver={this.onDragOver} data-node-count={this.canvas.nodes.length}>
            <ReactFlowProvider>
                <ReactFlow<Node<PartData>, Edge> nodes={this.rfNodes} edges={edges} nodeTypes={NODE_TYPES}
                    connectionMode={ConnectionMode.Loose} isValidConnection={this.isValidConnection}
                    onConnect={this.onConnect} onConnectStart={() => { this.refusal = ''; }} onConnectEnd={this.onConnectEnd} onNodesChange={this.onNodesChange}
                    onNodeDragStop={this.onNodeDragStop} onInit={flow => { this.flow = flow; }}
                    fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }} minZoom={0.3} maxZoom={2}
                    proOptions={{ hideAttribution: true }} deleteKeyCode={null}>
                    <Background gap={18} size={1} color='rgba(255,255,255,0.12)' />
                </ReactFlow>
            </ReactFlowProvider>
            {this.refusal && <div className='ownstudio-canvas-refusal' role='status'>{this.refusal}</div>}
            <span className='ownstudio-canvas-label'>{label}</span>
        </div>;
    }
}
