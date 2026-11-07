// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { OWNSTUDIO_DARK, OWNSTUDIO_LIGHT } from './ownstudio-themes';

/** Registers the OwnStudio light and dark themes before the first render. */
@injectable()
export class OwnStudioBrandingContribution implements FrontendApplicationContribution {

    @inject(MonacoThemingService)
    protected readonly theming: MonacoThemingService;

    initialize(): void {
        this.theming.registerParsedTheme(OWNSTUDIO_LIGHT);
        this.theming.registerParsedTheme(OWNSTUDIO_DARK);
    }
}
