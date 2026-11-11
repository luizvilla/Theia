// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio frontend module: branding, the window of 2.0 and the workbench views.
import '../../src/browser/style/ownstudio.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import {
    ApplicationShell, FrontendApplicationContribution, KeybindingContribution, WidgetFactory
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { OwnStudioBrandingContribution, OwnStudioMonacoThemingService } from './ownstudio-branding-contribution';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { WorkbenchContribution } from './workbench-contribution';
import { OwnStudioApplicationShell } from './ownstudio-shell';
import {
    CanvasWidget, DesignPanelWidget, InspectorWidget, LabPanelWidget, PartsWidget, TimelineWidget
} from './window-widgets';
import { BOTTOM_SLOTS, RIGHT_SLOTS, WORKBENCH_SLOTS } from '../common/window-layout';
import { WORKBENCHES, widgetId } from './workbenches';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { BOARD_SERVICE_PATH, BoardService } from '../common/board-protocol';
import { MissionService } from './mission-service';
import { BoardClientImpl, BoardModel } from './board-model';
import { BoardContribution, BoardPreferenceContribution } from './board-contribution';
import { SAFETY_WIDGET_ID, SafetyWidget } from './safety-widget';
import { SafetyContribution } from './safety-contribution';
import { LiveValues } from './live-values';
import { PANEL_WIDGET_FACTORY, PanelWidget, PanelWidgetOptions } from './panel-widget';
import { DATA_OBJECTS_WIDGET_ID, DataObjectsWidget } from './data-objects-widget';
import { LabWidget } from './lab-widget';
import { DesignWidget } from './design-widget';
import { Agent, bindToolProvider } from '@theia/ai-core';
import { ChatAgent } from '@theia/ai-chat/lib/common';
import {
    LoopMarginsTool, OwnStudioMissionAgent, ProposeControlChangeTool, ReadMissionFileTool, RunOnSimulatorTool, TestStatesTool
} from './ai/ownstudio-agent';
import { PROCEDURE_SERVICE_PATH, ProcedureService } from '../common/procedure-protocol';
import { ProcedureClientImpl, ProcedureModel } from './procedure-model';
import { PROCEDURE_WIDGET_ID, ProcedureWidget } from './procedure-widget';
import { CONTROL_CENTER_WIDGET_ID, ControlCenterWidget } from './control-center-widget';
import { LabContribution } from './lab-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(MissionService).toSelf().inSingletonScope();

    bind(BoardClientImpl).toSelf().inSingletonScope();
    bind(BoardService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BoardService>(ctx.container, BOARD_SERVICE_PATH, ctx.container.get(BoardClientImpl))
    ).inSingletonScope();
    bind(BoardModel).toSelf().inSingletonScope();
    bind(ProcedureClientImpl).toSelf().inSingletonScope();
    bind(ProcedureService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<ProcedureService>(ctx.container, PROCEDURE_SERVICE_PATH, ctx.container.get(ProcedureClientImpl))
    ).inSingletonScope();
    bind(ProcedureModel).toSelf().inSingletonScope();

    // The mission agent (SPEC §12): free-level tools only, nothing that reaches the board (ADR 0010).
    bind(OwnStudioMissionAgent).toSelf().inSingletonScope();
    bind(Agent).toService(OwnStudioMissionAgent);
    bind(ChatAgent).toService(OwnStudioMissionAgent);
    for (const tool of [ReadMissionFileTool, TestStatesTool, LoopMarginsTool, RunOnSimulatorTool, ProposeControlChangeTool]) {
        bindToolProvider(tool, bind);
    }
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

    bind(WorkbenchContribution).toSelf().inSingletonScope();
    for (const service of [CommandContribution, KeybindingContribution, FrontendApplicationContribution, TabBarToolbarContribution]) {
        bind(service).toService(WorkbenchContribution);
    }

    // Singletons: a workbench switch detaches the other centre view without disposing it.
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES.find(wb => wb.id === 'lab')!),
        createWidget: () => ctx.container.get(LabWidget),
    })).inSingletonScope();
    bind(DesignWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES.find(wb => wb.id === 'design')!),
        createWidget: () => ctx.container.get(DesignWidget),
    })).inSingletonScope();
});
