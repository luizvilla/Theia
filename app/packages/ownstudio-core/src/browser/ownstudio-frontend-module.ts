// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio frontend module: branding, expert mode, the workbench bar and the workbench views.
import '../../src/browser/style/ownstudio.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import {
    FrontendApplicationContribution, KeybindingContribution, PerspectiveContribution, WidgetFactory
} from '@theia/core/lib/browser';
import { OwnStudioBrandingContribution } from './ownstudio-branding-contribution';
import { ExpertModeContribution } from './expert-mode-contribution';
import { WorkbenchContribution } from './workbench-contribution';
import { WorkbenchWidget } from './workbench-widget';
import { HomeWidget } from './home-widget';
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
import { CONTROL_CENTER_WIDGET_ID, ControlCenterWidget } from './control-center-widget';
import { LabContribution } from './lab-contribution';

export default new ContainerModule(bind => {
    bind(MissionService).toSelf().inSingletonScope();

    bind(BoardClientImpl).toSelf().inSingletonScope();
    bind(BoardService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BoardService>(ctx.container, BOARD_SERVICE_PATH, ctx.container.get(BoardClientImpl))
    ).inSingletonScope();
    bind(BoardModel).toSelf().inSingletonScope();
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
    bind(LabWidget).toSelf();
    bind(LabContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(LabContribution);

    bind(OwnStudioBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OwnStudioBrandingContribution);

    bind(ExpertModeContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ExpertModeContribution);
    bind(FrontendApplicationContribution).toService(ExpertModeContribution);

    bind(WorkbenchContribution).toSelf().inSingletonScope();
    for (const service of [PerspectiveContribution, CommandContribution, KeybindingContribution, FrontendApplicationContribution]) {
        bind(service).toService(WorkbenchContribution);
    }

    bind(WorkbenchWidget).toSelf();
    // Not singletons: switching workbench closes (disposes) the others, and a
    // disposed React widget cannot render again. The factory makes a new one.
    bind(HomeWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES[0]),
        createWidget: () => ctx.container.get(HomeWidget),
    })).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES.find(wb => wb.id === 'lab')!),
        createWidget: () => ctx.container.get(LabWidget),
    })).inSingletonScope();
    for (const w of WORKBENCHES.filter(wb => wb.id !== 'home' && wb.id !== 'lab')) {
        bind(WidgetFactory).toDynamicValue(ctx => ({
            id: widgetId(w),
            createWidget: () => ctx.container.get(WorkbenchWidget).configure(w),
        })).inSingletonScope();
    }
});
