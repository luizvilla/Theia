// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplication, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry,
    StatusBar, StatusBarAlignment, Widget, WidgetManager, codicon
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { WORKBENCHES, Workbench, commandId, iconClass, widgetId } from './workbenches';
import { BOTTOM_SLOTS, RIGHT_SLOTS, STATUS_ACTIONS, WorkbenchId, bottomSlotOf, workbenchOfLeftWidget } from '../common/window-layout';
import { CanvasWidget } from './canvas-widget';
import { TabBar } from '@theia/core/shared/@lumino/widgets';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { SetupService } from '../common/setup-protocol';
import { START_WIDGET_ID } from './start-widget';
import { TimelineWidget } from './window-widgets';

const THEIA_NEW_TERMINAL = 'terminal:new';
type Side = 'left' | 'right';
export const NEW_TERMINAL = { id: 'ownstudio.terminal.new', category: 'OwnStudio', label: 'New Terminal', iconClass: codicon('terminal') };

/** What each status bar action will do, and the plan commit that brings it. */
const COMING: Record<string, string> = {
    'ownstudio.setup.build': 'Build arrives with the Code toolbar (slice 1, U10).',
    'ownstudio.setup.upload': 'Upload arrives with the Code toolbar (slice 1, U10).',
    'ownstudio.setup.serial': 'The serial monitor arrives with the Code toolbar (slice 1, U10).',
};

/**
 * The window of OwnStudio 2.0 (SPEC §5, storyboard frame 0):
 * - left icon bar: Design, Code, Lab; each is a side panel, and opening it is a
 *   workbench switch (Design and Lab also show their centre view; Code leaves the
 *   editors where they are);
 * - right icon bar: Parts, Inspector, AI, the same in every workbench;
 * - bottom: Canvas (tinted per workbench), Terminal, Build output, with a
 *   terminal button; the timeline strip under them (OwnStudioApplicationShell);
 * - status bar: Build, Upload, Serial on the left.
 *
 * Switches do not go through Theia's perspectives (luizvilla/Theia#13) and are
 * queued, so quick clicks land in order.
 */
@injectable()
export class WorkbenchContribution implements CommandContribution, KeybindingContribution, FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(TimelineWidget) protected readonly timeline: TimelineWidget;

    /** No setup open: the Start page fills the window (frame 1) until a workbench is chosen. */
    protected startMode = false;

    protected active: Workbench | undefined;
    protected queue: Promise<void> = Promise.resolve();

    get activeWorkbench(): WorkbenchId | undefined { return this.active?.id; }

    registerCommands(registry: CommandRegistry): void {
        for (const w of WORKBENCHES) {
            registry.registerCommand({ id: commandId(w), category: 'OwnStudio', label: `Open ${w.label}` },
                { execute: () => this.switchTo(w) });
        }
        for (const a of STATUS_ACTIONS) {
            registry.registerCommand({ id: a.command, category: 'OwnStudio', label: a.label },
                { execute: () => this.messages.info(COMING[a.command]) });
        }
        registry.registerCommand(NEW_TERMINAL, { execute: () => registry.executeCommand(THEIA_NEW_TERMINAL) });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        for (const w of WORKBENCHES) {
            registry.registerKeybinding({ command: commandId(w), keybinding: w.keybinding });
        }
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        // The terminal button at the right of the bottom tabs (frame 0).
        registry.registerItem({
            id: NEW_TERMINAL.id, command: NEW_TERMINAL.id, tooltip: 'New terminal', icon: NEW_TERMINAL.iconClass,
            isVisible: (widget?: Widget) => !!widget && !!bottomSlotOf(widget.id),
        });
    }

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        await this.buildWindow();
        this.shell.leftPanelHandler.tabBar.currentChanged.connect((_, args) => {
            const slot = workbenchOfLeftWidget(args.currentTitle?.owner.id);
            const target = slot && WORKBENCHES.find(w => w.id === slot.id);
            if (target && target !== this.active) {
                this.switchTo(target);
            }
        });
        this.renderStatus();
        if (await this.setupIsOpen()) {
            await this.switchTo(WORKBENCHES.find(w => w.id === 'code')!);
        } else {
            await this.showStart();
        }
    }

    protected async setupIsOpen(): Promise<boolean> {
        const roots = await this.workspace.roots;
        return roots.length > 0 && this.setups.isSetup(roots[0].resource.path.fsPath()).catch(() => false);
    }

    /** Frame 1: the Start page alone, the icon bars kept, panels, canvas and timeline put away. */
    async showStart(): Promise<void> {
        this.startMode = true;
        this.active = undefined;
        const start = await this.widgets.getOrCreateWidget(START_WIDGET_ID);
        if (!start.isAttached) {
            await this.shell.addWidget(start, { area: 'main' });
        }
        this.shell.mainPanel.activateWidget(start);
        for (const area of ['left', 'right', 'bottom'] as const) {
            this.shell.collapsePanel(area);
        }
        this.timeline.setHidden(true);
        document.body.dataset.ownstudioWorkbench = 'start';
    }

    protected leaveStart(): void {
        if (!this.startMode) {
            return;
        }
        this.startMode = false;
        this.shell.expandPanel('right');
        this.shell.expandPanel('bottom');
        this.timeline.setHidden(false);
    }

    /** Puts every panel of frame 0 in its place. */
    protected async buildWindow(): Promise<void> {
        for (const [i, w] of WORKBENCHES.entries()) {
            const widget = await this.widgets.getOrCreateWidget(w.widgetId).catch(() => undefined);
            if (!widget) {
                continue;
            }
            // Theia's explorer is the Code workbench's panel: same icon set as the other two.
            this.keepTitle(widget, w.label, w.iconClass);
            if (!widget.isAttached || this.shell.getAreaFor(widget) !== 'left') {
                await this.shell.addWidget(widget, { area: 'left', rank: 100 + i });
            }
        }
        for (const [i, slot] of RIGHT_SLOTS.entries()) {
            const widget = await this.widgets.getOrCreateWidget(slot.widgetId).catch(() => undefined);
            if (!widget) {
                continue;
            }
            this.keepTitle(widget, slot.label, iconClass(slot.icon));
            if (!widget.isAttached || this.shell.getAreaFor(widget) !== 'right') {
                await this.shell.addWidget(widget, { area: 'right', rank: 100 + i });
            }
        }
        for (const [i, slot] of BOTTOM_SLOTS.entries()) {
            if (slot.id === 'terminal') {
                if (!this.shell.getWidgets('bottom').some(w => bottomSlotOf(w.id)?.id === 'terminal')) {
                    await this.commands.executeCommand(THEIA_NEW_TERMINAL).catch(() => undefined);
                }
                continue;
            }
            const widget = await this.widgets.getOrCreateWidget(slot.widgetId).catch(() => undefined);
            if (!widget) {
                continue;
            }
            this.keepTitle(widget, slot.label);
            if (!widget.isAttached || this.shell.getAreaFor(widget) !== 'bottom') {
                await this.shell.addWidget(widget, { area: 'bottom', rank: 100 + i });
            }
        }
        for (const w of WORKBENCHES.filter(x => x.centreId)) {
            // Made now, so the first switch to Design or Lab is as quick as the others.
            await this.widgets.getOrCreateWidget(widgetId(w)).catch(() => undefined);
        }
        this.tidy();
        this.shell.expandPanel('left');
        this.shell.expandPanel('right');
        this.shell.expandPanel('bottom');
        const canvas = this.shell.getWidgets('bottom').find(w => w.id === BOTTOM_SLOTS[0].widgetId);
        if (canvas) {
            this.shell.bottomPanel.activateWidget(canvas);
        }
        const inspector = this.shell.getWidgets('right').find(w => w.id === RIGHT_SLOTS[1].widgetId);
        if (inspector) {
            this.shell.rightPanelHandler.activate(inspector.id);
        }
    }

    /**
     * The bars show what frame 0 shows, in its order. Theia's other views (Search,
     * Source Control, Debug, Testing, Outline, Problems) leave the bars; the View
     * menu still opens them.
     */
    protected tidy(): void {
        const order: Array<[Side, string[]]> = [
            ['left', WORKBENCHES.map(w => w.widgetId)],
            ['right', RIGHT_SLOTS.map(s => s.widgetId)],
        ];
        for (const [side, ids] of order) {
            const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
            for (const widget of this.shell.getWidgets(side)) {
                if (!ids.includes(widget.id)) {
                    widget.close();
                }
            }
            ids.forEach((id, i) => {
                const title = handler.tabBar.titles.find(t => t.owner.id === id);
                if (title) {
                    handler.tabBar.insertTab(i, title);     // moves it
                }
            });
        }
        for (const widget of this.shell.getWidgets('bottom')) {
            if (!bottomSlotOf(widget.id)) {
                widget.close();
            }
        }
        const tabBar = this.shell.bottomPanel.tabBars().next().value as TabBar<Widget> | undefined;
        if (tabBar) {
            const titles = [...tabBar.titles];
            BOTTOM_SLOTS.forEach((slot, i) => {
                const title = titles.find(t => bottomSlotOf(t.owner.id)?.id === slot.id);
                if (title) {
                    tabBar.insertTab(i, title);
                }
            });
        }
        for (const widget of this.shell.getWidgets('bottom')) {
            if (bottomSlotOf(widget.id)?.id === 'terminal') {
                this.keepTitle(widget, widget.id === 'terminal-0' ? 'Terminal' : `Terminal ${widget.id.replace('terminal-', '')}`, codicon('terminal'));
            }
        }
    }

    /** Theia's own widgets rename themselves (the explorer, a terminal after its shell): keep ours. */
    protected keepTitle(widget: Widget, label: string, icon?: string): void {
        const apply = () => {
            if (widget.title.label !== label) {
                widget.title.label = label;
            }
            if (icon && widget.title.iconClass !== icon) {
                widget.title.iconClass = icon;
            }
        };
        if (!this.kept.has(widget)) {
            this.kept.add(widget);
            widget.title.changed.connect(apply);
        }
        apply();
    }
    protected readonly kept = new WeakSet<Widget>();

    /** Show a workbench. The state changes at once; the window follows, switches in order. */
    switchTo(target: Workbench): Promise<void> {
        this.active = target;
        this.queue = this.queue.catch(() => undefined).then(() => this.show(target));
        return this.queue;
    }

    protected async show(target: Workbench): Promise<void> {
        if (this.active !== target) {
            return;     // a later switch is queued: skip this one
        }
        this.leaveStart();
        const left = this.shell.getWidgets('left').find(w => w.id === target.widgetId);
        if (left && this.shell.leftPanelHandler.tabBar.currentTitle?.owner !== left) {
            this.shell.leftPanelHandler.activate(left.id);
        }
        this.shell.expandPanel('left');
        for (const w of WORKBENCHES) {
            const other = w !== target && w.centreId ? this.widgets.tryGetWidget(widgetId(w)) : undefined;
            if (other?.isAttached) {
                // Detached, not closed: the view keeps its state and comes back at once.
                other.parent = null;
            }
        }
        if (target.centreId) {
            const widget = await this.widgets.getOrCreateWidget(widgetId(target));
            if (!widget.isAttached) {
                await this.shell.addWidget(widget, { area: 'main' });
            }
            this.shell.mainPanel.activateWidget(widget);
        }
        this.widgets.tryGetWidget<CanvasWidget>(BOTTOM_SLOTS[0].widgetId)?.setWorkbench(target.id);
        document.body.dataset.ownstudioWorkbench = target.id;
    }

    protected renderStatus(): void {
        STATUS_ACTIONS.forEach((a, i) => this.statusBar.setElement(a.id, {
            text: `$(${a.codicon})`,
            alignment: StatusBarAlignment.LEFT,
            priority: 2000 - i,
            command: a.command,
            tooltip: a.tooltip,
            className: 'ownstudio-status-action',
        }));
    }
}
