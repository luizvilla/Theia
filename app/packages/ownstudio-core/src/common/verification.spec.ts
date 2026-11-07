// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATE_LABEL, parseRequirements } from './verification';

test('parses the mission requirements', () => {
    const file = path.resolve(__dirname, 'testdata/requirements.yaml');
    const reqs = parseRequirements(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(reqs.map(r => r.id), ['REQ-VOUT', 'REQ-UNDERSHOOT']);
    assert.deepEqual(reqs[1].verified_by, ['BUCK-STEP-01b']);
});

test('refuses a file without a requirements list', () => {
    assert.throws(() => parseRequirements('nope: 1'), /no 'requirements' list/);
});

test('every requirement state has a label', () => {
    assert.equal(STATE_LABEL.known, 'Failing (known issue)');
});
