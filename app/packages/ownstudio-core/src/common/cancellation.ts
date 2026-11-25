// SPDX-License-Identifier: LGPL-2.1-only
// #50: during restores, clangd's inlay-hints requests are cancelled, and the plugin host
// rejects them with its cancelled token itself (decoded in the window as a plain
// { _isCancelled: true } object) instead of a cancellation error. Monaco reports any
// non-cancellation rejection as an unexpected error. This says when a rejection is
// really a cancellation, so it can be dropped as Monaco would drop its own.

/** True when `error` is a cancelled token, or the request it answers was cancelled anyway. */
export function isCancellation(error: unknown, token: { isCancellationRequested: boolean } | undefined): boolean {
    if (token?.isCancellationRequested) {
        return true;
    }
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const e = error as { _isCancelled?: unknown; isCancellationRequested?: unknown };
    return e._isCancelled === true || e.isCancellationRequested === true;
}
