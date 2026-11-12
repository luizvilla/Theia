// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setRequirementValue } from './requirements-edit.js';
import { parseRequirements } from './verification.js';
import { fileURLToPath } from 'node:url';

// ES module: where this file is (the bundle, for the backend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const file = fs.readFileSync(path.resolve(__dirname, 'testdata/requirements-block.yaml'), 'utf8');

test('changes one value and keeps everything else', () => {
    const out = setRequirementValue(file, 'REQ-UNDERSHOOT', 0.06);
    const changed = out.split('\n').filter((l, i) => l !== file.split('\n')[i]);
    assert.equal(changed.length, 1);
    assert.match(changed[0], /value: 0\.06/);
    assert.equal(parseRequirements(out).find(r => r.id === 'REQ-UNDERSHOOT')!.value, 0.06);
});

test('integers keep a decimal point', () => {
    assert.match(setRequirementValue(file, 'REQ-VOUT', 15), /value: 15\.0/);
});

test('refuses unknown requirements and non-numbers', () => {
    assert.throws(() => setRequirementValue(file, 'REQ-NOPE', 1), /no requirement REQ-NOPE/);
    assert.throws(() => setRequirementValue(file, 'REQ-VOUT', NaN), /must be a number/);
});
