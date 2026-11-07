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
    bind(HomeWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: widgetId(WORKBENCHES[0]),
        createWidget: () => ctx.container.get(HomeWidget),
    })).inSingletonScope();
    for (const w of WORKBENCHES.filter(wb => wb.id !== 'home')) {
        bind(WidgetFactory).toDynamicValue(ctx => ({
            id: widgetId(w),
            createWidget: () => ctx.container.get(WorkbenchWidget).configure(w),
        })).inSingletonScope();
    }
});
