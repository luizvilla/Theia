// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isCancellation } from './cancellation.js';

test('#50: a cancelled token thrown back over the plugin RPC is a cancellation', () => {
    // As it arrives from the plugin host: a plain object, decoded from msgpack.
    assert.equal(isCancellation({ _isCancelled: true, _emitter: undefined }, { isCancellationRequested: false }), true);
    assert.equal(isCancellation({ isCancellationRequested: true, onCancellationRequested: () => undefined }, undefined), true);
});

test('#50: any failure after the request was cancelled is a cancellation', () => {
    assert.equal(isCancellation(new Error('connection lost'), { isCancellationRequested: true }), true);
});

test('#50: a real failure stays an error', () => {
    assert.equal(isCancellation(new Error('clangd crashed'), { isCancellationRequested: false }), false);
    assert.equal(isCancellation({ _isCancelled: false }, { isCancellationRequested: false }), false);
    assert.equal(isCancellation(undefined, undefined), false);
});
