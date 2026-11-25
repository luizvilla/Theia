// SPDX-License-Identifier: LGPL-2.1-only
// #50: Theia's bridge for extensions' inlay hints (clangd's, in C++ files) passes the plugin
// host's rejection straight to Monaco. When a restore swaps the open file, clangd's pending
// requests are cancelled and come back rejected with the plugin host's cancelled token, which
// Monaco rethrows as an uncaught error. A cancellation now yields no hints; Monaco then sees
// its own token cancelled and drops the request, as it does for every cancelled request.
import { LanguagesMainImpl } from '@theia/plugin-ext/lib/main/browser/languages-main';
import { isCancellation } from '../common/cancellation.js';

type Provider = ReturnType<LanguagesMainImpl['createInlayHintsProvider']>;

/** Once, when the frontend module loads. */
export function dropCancelledInlayHints(): void {
    const proto = LanguagesMainImpl.prototype as LanguagesMainImpl & { ownstudioCancellation?: boolean };
    if (proto.ownstudioCancellation) {
        return;
    }
    const theirs = proto.createInlayHintsProvider;
    proto.createInlayHintsProvider = function (this: LanguagesMainImpl, handle: number): Provider {
        const provider = theirs.call(this, handle);
        const provide = provider.provideInlayHints.bind(provider);
        provider.provideInlayHints = async (model, range, token) => {
            try {
                return await provide(model, range, token);
            } catch (error) {
                if (isCancellation(error, token)) {
                    return undefined;
                }
                throw error;
            }
        };
        return provider;
    };
    proto.ownstudioCancellation = true;
}
