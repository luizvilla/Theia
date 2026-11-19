// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ansi, onlyColours, stripAnsi } from './build-protocol.js';

// F10: a GCC error line as PlatformIO passes it on with -fdiagnostics-color=always.
const gcc = '\x1b[01m\x1b[Ksrc/control.cpp:41:14:\x1b[m\x1b[K \x1b[01;31m\x1b[Kerror: \x1b[m\x1b[Kexpected primary-expression';

test('F10: Build output keeps the colours and drops the codes Theia would print as text', () => {
    assert.equal(onlyColours(gcc), '\x1b[01msrc/control.cpp:41:14:\x1b[m \x1b[01;31merror: \x1b[mexpected primary-expression');
});

test('F10: progress and byte counts read the text without colours', () => {
    assert.equal(stripAnsi(gcc), 'src/control.cpp:41:14: error: expected primary-expression');
    assert.equal(stripAnsi(ansi.green('Build 8a0a099b ✓ 89 s')), 'Build 8a0a099b ✓ 89 s');
});
