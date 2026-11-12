// SPDX-License-Identifier: LGPL-2.1-only
import * as assert from 'assert';
import { test } from 'node:test';
import { PowerTokenStore } from './power-token';

test('a power token is required and can be consumed only once', () => {
    const store = new PowerTokenStore(() => 100, 1000, () => 'from-dialog');
    assert.equal(store.consume(undefined), false);
    assert.equal(store.consume('invented'), false);
    assert.equal(store.issue(), 'from-dialog');
    assert.equal(store.consume('from-dialog'), true);
    assert.equal(store.consume('from-dialog'), false);
});

test('an unused power token expires', () => {
    let now = 100;
    const store = new PowerTokenStore(() => now, 20, () => 'short');
    store.issue();
    now = 121;
    assert.equal(store.consume('short'), false);
});
