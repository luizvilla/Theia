// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio frontend module: branding, the window of 2.0 and the workbench views.
import '../../src/browser/style/ownstudio.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuModelRegistry } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplicationContribution, KeybindingContribution, WidgetFactory
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { OwnStudioBrandingContribution, OwnStudioMonacoThemingService } from './ownstudio-branding-contribution.js';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { WorkbenchContribution } from './workbench-contribution.js';
import { OwnStudioApplicationShell } from './ownstudio-shell.js';
import { MenuMapContribution, OwnStudioMenuModelRegistry } from './menu-map-contribution.js';
import { SETUP_SERVICE_PATH, SetupService } from '../common/setup-protocol.js';
import { START_WIDGET_ID, StartWidget } from './start-widget.js';
import { ExampleContribution } from './example-contribution.js';
import {
    DesignPanelWidget, InspectorWidget, LabPanelWidget, PartsWidget
} from './window-widgets.js';
import { CanvasWidget } from './canvas-widget.js';
import { BOTTOM_SLOTS, RIGHT_SLOTS, WORKBENCH_SLOTS } from '../common/window-layout.js';
import { WORKBENCHES, widgetId } from './workbenches.js';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { BOARD_SERVICE_PATH, BoardService } from '../common/board-protocol.js';
import { MissionService } from './mission-service.js';
import { BoardClientImpl, BoardModel } from './board-model.js';
import { BoardContribution, BoardPreferenceContribution } from './board-contribution.js';
import { SAFETY_WIDGET_ID, SafetyWidget } from './safety-widget.js';
import { SafetyContribution } from './safety-contribution.js';
import { LiveValues } from './live-values.js';
import { PANEL_WIDGET_FACTORY, PanelWidget, PanelWidgetOptions } from './panel-widget.js';
import { DATA_OBJECTS_WIDGET_ID, DataObjectsWidget } from './data-objects-widget.js';
import { LabWidget } from './lab-widget.js';
import { DesignWidget } from './design-widget.js';
import { DesignModel } from './design-model.js';
import { ClaudeCodeChatAgent } from '@theia/ai-claude-code/lib/browser/claude-code-chat-agent';
import { CodexChatAgent } from '@theia/ai-codex/lib/browser/codex-chat-agent';
import { OwnStudioClaudeCodeChatAgent, OwnStudioCodexChatAgent } from './ai/agents.js';
import { TimelineWidget } from './timeline-widget.js';
import { TimelineModel } from './timeline-model.js';
import { TimelineContribution } from './timeline-contribution.js';
import { TIMELINE_PREVIEW_ID, TimelinePreviewWidget } from './timeline-preview-widget.js';
import { PROCEDURE_SERVICE_PATH, ProcedureService } from '../common/procedure-protocol.js';
import { ProcedureClientImpl, ProcedureModel } from './procedure-model.js';
import { PROCEDURE_WIDGET_ID, ProcedureWidget } from './procedure-widget.js';
import { CONTROL_CENTER_WIDGET_ID, ControlCenterWidget } from './control-center-widget.js';
import { LabContribution } from './lab-contribution.js';
import { BUILD_SERVICE_PATH, BuildService } from '../common/build-protocol.js';
import { BuildClientImpl, BuildContribution } from './build-contribution.js';
import { LabChecklistModel } from './lab-checklist-model.js';
import { LabChecklistContribution } from './lab-checklist-contribution.js';
import { CanvasState } from './canvas-state.js';
import { PulsimGuiContribution } from './pulsimgui-contribution.js';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(MissionService).toSelf().inSingletonScope();

    bind(BoardClientImpl).toSelf().inSingletonScope();
    bind(BoardService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BoardService>(ctx.container, BOARD_SERVICE_PATH, ctx.container.get(BoardClientImpl))
    ).inSingletonScope();
    bind(BoardModel).toSelf().inSingletonScope();
    bind(SetupService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<SetupService>(ctx.container, SETUP_SERVICE_PATH)
    ).inSingletonScope();
    bind(BuildClientImpl).toSelf().inSingletonScope();
    bind(BuildService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BuildService>(ctx.container, BUILD_SERVICE_PATH, ctx.container.get(BuildClientImpl))
    ).inSingletonScope();
    bind(BuildContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(BuildContribution);
    bind(TabBarToolbarContribution).toService(BuildContribution);
    bind(ExampleContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ExampleContribution);
    bind(StartWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({ id: START_WIDGET_ID, createWidget: () => ctx.container.get(StartWidget) })).inSingletonScope();
    bind(ProcedureClientImpl).toSelf().inSingletonScope();
    bind(ProcedureService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<ProcedureService>(ctx.container, PROCEDURE_SERVICE_PATH, ctx.container.get(ProcedureClientImpl))
    ).inSingletonScope();
    bind(LabChecklistModel).toSelf().inSingletonScope();
    bind(ProcedureModel).toSelf().inSingletonScope();
    bind(LabChecklistContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(LabChecklistContribution);

    // The user's own agents (SPEC §12, plan U17), without the modes that skip approval or the sandbox.
    rebind(ClaudeCodeChatAgent).to(OwnStudioClaudeCodeChatAgent).inSingletonScope();
    rebind(CodexChatAgent).to(OwnStudioCodexChatAgent).inSingletonScope();
    bind(ProcedureWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PROCEDURE_WIDGET_ID,
        createWidget: () => ctx.container.get(ProcedureWidget),
    })).inSingletonScope();
    bind(BoardContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(BoardContribution);
    bind(FrontendApplicationContribution).toService(BoardContribution);
    bind(PreferenceContribution).toConstantValue(BoardPreferenceContribution);

    bind(SafetyWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SAFETY_WIDGET_ID,
        createWidget: () => ctx.container.get(SafetyWidget),
    })).inSingletonScope();
    bind(SafetyContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SafetyContribution);

    bind(LiveValues).toSelf().inSingletonScope();
    bind(PanelWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PANEL_WIDGET_FACTORY,
        createWidget: (options: PanelWidgetOptions) => ctx.container.get(PanelWidget).configure(options),
    })).inSingletonScope();
    bind(DataObjectsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: DATA_OBJECTS_WIDGET_ID,
        createWidget: () => ctx.container.get(DataObjectsWidget),
    })).inSingletonScope();
    bind(ControlCenterWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CONTROL_CENTER_WIDGET_ID,
        createWidget: () => ctx.container.get(ControlCenterWidget),
    })).inSingletonScope();
    bind(LabWidget).toSelf().inSingletonScope();
    bind(LabContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(LabContribution);

    bind(OwnStudioMonacoThemingService).toSelf().inSingletonScope();
    rebind(MonacoThemingService).toService(OwnStudioMonacoThemingService);
    bind(OwnStudioBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OwnStudioBrandingContribution);

    // The window of 2.0 (plan U2): the timeline strip under the centre, the panels of frame 0.
    bind(TimelineWidget).toSelf().inSingletonScope();
    // The timeline (plan U18): model, preview in the centre, History menu.
    bind(TimelineModel).toSelf().inSingletonScope();
    bind(TimelineContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TimelineContribution);
    bind(TimelinePreviewWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TIMELINE_PREVIEW_ID,
        createWidget: () => ctx.container.get(TimelinePreviewWidget),
    })).inSingletonScope();
    bind(OwnStudioApplicationShell).toSelf().inSingletonScope();
    rebind(ApplicationShell).toService(OwnStudioApplicationShell);
    const panels = [
        [WORKBENCH_SLOTS[0].widgetId, DesignPanelWidget], [WORKBENCH_SLOTS[2].widgetId, LabPanelWidget],
        [RIGHT_SLOTS[0].widgetId, PartsWidget], [RIGHT_SLOTS[1].widgetId, InspectorWidget], [BOTTOM_SLOTS[0].widgetId, CanvasWidget],
    ] as const;
    for (const [id, widget] of panels) {
        bind(widget).toSelf().inSingletonScope();
        bind(WidgetFactory).toDynamicValue(ctx => ({ id, createWidget: () => ctx.container.get(widget) })).inSingletonScope();
    }
    bind(CanvasState).toService(CanvasWidget);
    bind(PulsimGuiContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(PulsimGuiContribution);
    bind(FrontendApplicationContribution).toService(PulsimGuiContribution);

    // The eight menus (plan U3): the menu bar is common/menu-map.ts and nothing else.
    bind(OwnStudioMenuModelRegistry).toSelf().inSingletonScope();
    rebind(MenuModelRegistry).toService(OwnStudioMenuModelRegistry);
    bind(MenuMapContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MenuMapContribution);

    bind(WorkbenchContribution).toSelf().inSingletonScope();
    for (const service of [CommandContribution, KeybindingContribution, FrontendApplicationContribution, TabBarToolbarContribution]) {
        bind(service).toService(WorkbenchContribution);
    }

    // Singletons: a workbench switch detaches the other centre view without disposing it.
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES.find(wb => wb.id === 'lab')!),
        createWidget: () => ctx.container.get(LabWidget),
    })).inSingletonScope();
    bind(DesignModel).toSelf().inSingletonScope();
    bind(DesignWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES.find(wb => wb.id === 'design')!),
        createWidget: () => ctx.container.get(DesignWidget),
    })).inSingletonScope();
});
