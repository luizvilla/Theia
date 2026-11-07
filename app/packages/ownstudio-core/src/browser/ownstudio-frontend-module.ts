// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio frontend module: branding, expert mode, and (next steps) the workbenches and Home.
import '../../src/browser/style/ownstudio.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { OwnStudioBrandingContribution } from './ownstudio-branding-contribution';
import { ExpertModeContribution } from './expert-mode-contribution';

export default new ContainerModule(bind => {
    bind(OwnStudioBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OwnStudioBrandingContribution);

    bind(ExpertModeContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ExpertModeContribution);
    bind(FrontendApplicationContribution).toService(ExpertModeContribution);
});
