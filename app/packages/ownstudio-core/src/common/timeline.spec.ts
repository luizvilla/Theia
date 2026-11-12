// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EVENT_STYLE, dotLabel } from './timeline.js';

const dot = (event: string, summary: string) => ({ commit: 'c', event, summary, date: '2026-11-12T20:00:00+01:00' });

test('a dot is labelled by what changed, not by its event again', () => {
    assert.equal(dotLabel(dot('design', 'design: L 47 µH')), 'L 47 µH');
    assert.equal(dotLabel(dot('milestone', 'milestone: kp tuned')), 'kp tuned');
    assert.equal(dotLabel(dot('build', 'Build c2f17421be7dfa4a ✓')), 'Build c2f17421be7dfa4a ✓');
    assert.equal(dotLabel(dot('canvas', 'canvas: ' + 'x'.repeat(40))).length, 28);
});

test('every event the setups module commits has a style', () => {
    for (const event of ['create', 'example', 'canvas', 'code', 'design', 'build', 'flash', 'run', 'simulate', 'milestone', 'save', 'restore']) {
        assert.ok(EVENT_STYLE[event], event);
    }
});
