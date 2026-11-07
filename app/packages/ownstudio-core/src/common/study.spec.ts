// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { StudyEvent, parseLog, stepTimes, stepTimesCsv, susScore, validParticipant } from './study';

const ev = (t: string, kind: StudyEvent['kind'], step?: string): StudyEvent =>
    ({ t: `2026-11-20T10:${t}Z`, participant: 'P01', mission: 'm', kind, step });

test('SUS: the standard scoring', () => {
    assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
    assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
    assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50);
    assert.equal(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]), 75);
    assert.equal(susScore([3, 3]), undefined);
    assert.equal(susScore([0, 3, 3, 3, 3, 3, 3, 3, 3, 3]), undefined);
});

test('step times: each start to the next done, a reopened step adds up', () => {
    const times = stepTimes([
        ev('00:00', 'step-start', 'size'), ev('05:00', 'step-done', 'size'),
        ev('06:00', 'step-start', 'simulate'),
        ev('07:00', 'step-start', 'size'), ev('08:30', 'step-done', 'size'),
    ]);
    assert.deepEqual(times.map(s => [s.step, s.seconds, s.starts]), [['size', 390, 2], ['simulate', undefined, 1]]);
    assert.equal(times[0].done, '2026-11-20T10:08:30Z');
});

test('a damaged log line is skipped', () => {
    assert.equal(parseLog('{"t":"x","kind":"consent"}\nnot json\n\n').length, 1);
});

test('participant codes carry no name', () => {
    assert.ok(validParticipant('P03'));
    assert.ok(!validParticipant('Jean Dupont'));
    assert.ok(!validParticipant(''));
});

test('step times as CSV', () => {
    const csv = stepTimesCsv('P01', 'm', [ev('00:00', 'step-start', 'size'), ev('01:00', 'step-done', 'size')]);
    assert.equal(csv.split('\n')[1], 'P01,m,size,2026-11-20T10:00:00Z,2026-11-20T10:01:00Z,60.0,1');
});
