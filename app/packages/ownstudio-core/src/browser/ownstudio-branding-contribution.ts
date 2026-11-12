// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { OWNSTUDIO_DARK, OWNSTUDIO_LIGHT } from './ownstudio-themes.js';

/** Registers the OwnStudio light and dark themes before the first render. */
@injectable()
export class OwnStudioBrandingContribution implements FrontendApplicationContribution {

    @inject(MonacoThemingService)
    protected readonly theming: MonacoThemingService;

    initialize(): void {
        registerOwnStudioThemes(this.theming);
    }
}

export function registerOwnStudioThemes(theming: MonacoThemingService): void {
    theming.registerParsedTheme(OWNSTUDIO_LIGHT);
    theming.registerParsedTheme(OWNSTUDIO_DARK);
}

/**
 * Theia restores the themes it cached in IndexedDB asynchronously, after the
 * contributions' initialize(), and writes them back. A copy cached by an older
 * OwnStudio (one without token colours) would then replace the current themes
 * on every launch. Registering again once the restore is done makes the
 * current definitions win, and refreshes the cache.
 */
@injectable()
export class OwnStudioMonacoThemingService extends MonacoThemingService {
    override async restore(): Promise<void> {
        await super.restore();
        registerOwnStudioThemes(this);
    }
}
