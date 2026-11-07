// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Requirement, TestRecord, parseRecord, parseRequirements, verify } from './verification';

const req = (cases: string[]): Requirement => ({ id: 'R', title: 'R', statement: '', verified_by: cases });
const record = (target: string, date: string, passed: boolean, id = 'C1'): TestRecord => ({
    procedure: 'p', level: 'L1', target, date, verdict: passed ? 'PASS' : 'FAIL', folder: 'records/x',
    cases: [{ id, title: 't', measured: 1, expected: 1, criterion: 'c', passed }],
});

test('states follow SPEC §5', () => {
    assert.equal(verify(req([]), []).state, 'no-case');
    assert.equal(verify(req(['C1']), []).state, 'untested');
    assert.equal(verify(req(['C1']), [record('simulator', '2026-11-07T01:00:00Z', true)]).state, 'sim-pass');
    assert.equal(verify(req(['C1']), [record('simulator', '2026-11-07T01:00:00Z', false)]).state, 'fail');
    assert.equal(verify(req(['C1']), [record('board', '2026-11-07T01:00:00Z', true)]).state, 'bench-pass');
    assert.equal(verify(req(['C1']), [record('simulator', '2026-11-07T01:00:00Z', true), record('board', '2026-11-07T02:00:00Z', true)]).state, 'bench-pass');
    assert.equal(verify(req(['C1']), [record('simulator', '2026-11-07T01:00:00Z', true), record('board', '2026-11-07T02:00:00Z', false)]).state, 'disagree');
});

test('only the latest record on each target counts', () => {
    const records = [record('simulator', '2026-11-07T01:00:00Z', false), record('simulator', '2026-11-07T03:00:00Z', true)];
    assert.equal(verify(req(['C1']), records).state, 'sim-pass');
    assert.equal(verify(req(['C1']), records.reverse()).state, 'sim-pass');
});

test('records of other cases are ignored', () => {
    assert.equal(verify(req(['C1']), [record('simulator', '2026-11-07T01:00:00Z', false, 'C2')]).state, 'untested');
});

test('parses the mission requirements and refuses non-records', () => {
    const file = path.resolve(__dirname, 'testdata/requirements.yaml');
    const reqs = parseRequirements(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(reqs.map(r => r.id), ['REQ-VOUT', 'REQ-UNDERSHOOT']);
    assert.deepEqual(reqs[1].verified_by, ['BUCK-STEP-01b']);
    assert.equal(parseRecord('{"not": "a record"}', 'x'), undefined);
    assert.equal(parseRecord('nope', 'x'), undefined);
});
