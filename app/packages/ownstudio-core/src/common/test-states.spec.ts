// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BlockResult, TestEntry, blockCounts, blockInfo, caseVerdict, countStates, formatMeasured, stateInfo } from './test-states.js';

const entry = (id: string, state: TestEntry['state']): TestEntry => ({
    id, tab: 'a', level: 'L1', title: 't', criterion: 'c', status: 'implemented', target: 'simulator', state,
    latest: null, finding: null,
});

test('case verdicts', () => {
    assert.equal(caseVerdict({ id: 'a', title: 't', passed: true }), 'PASS');
    assert.equal(caseVerdict({ id: 'a', title: 't', passed: false }), 'FAIL');
    assert.equal(caseVerdict({ id: 'a', title: 't', verdict: 'INFO' }), 'INFO');
});

test('counts follow the worst-first order and skip empty states', () => {
    const counts = countStates([entry('a', 'pass'), entry('b', 'fail'), entry('c', 'pass')]);
    assert.deepEqual(counts, [{ id: 'fail', count: 1 }, { id: 'pass', count: 2 }]);
});

test('every state has an icon and a word', () => {
    assert.equal(stateInfo('known').word, 'Failing (known)');
    assert.equal(stateInfo('planned').icon, '◌');
});

test('measured values are shown with four significant digits', () => {
    assert.equal(formatMeasured({ id: 'a', title: 't', measured: 11.3217, unit: 'V' }), '11.32 V');
    assert.equal(formatMeasured({ id: 'a', title: 't' }), '—');
});

test('a block passed on the board is a bench pass; in simulation only, a sim pass', () => {
    const b: BlockResult = { state: 'pass', tests: ['A', 'B'], counts: { pass: 2 }, evidence: ['simulator'] };
    assert.deepEqual([blockInfo(b).word, blockInfo(b).evidence, blockInfo(b).colour], ['Passed', 'simulation only', 'sim-pass']);
    assert.equal(blockInfo({ ...b, evidence: ['board', 'simulator'] }).colour, 'bench-pass');
    assert.equal(blockInfo({ state: 'no_test', tests: [], counts: {}, evidence: [] }).word, 'No test');
    assert.equal(blockInfo({ ...b, state: 'not_run' }).colour, 'untested');
    assert.equal(blockInfo({ ...b, state: 'known' }).evidence, '');
});

test('block counts read worst first, in words', () => {
    assert.equal(blockCounts({ state: 'known', tests: [], counts: { pass: 10, known: 1, not_run: 2 }, evidence: [] }),
        '1 failing (known), 10 passed, 2 not run yet');
});
