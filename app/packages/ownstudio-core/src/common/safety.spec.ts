// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBoardPack } from './board-pack.js';
import { checkEnvelope, firmwareEnablesSafety, setEnvelopeValue } from './safety.js';
import { fileURLToPath } from 'node:url';

// ES module: where this file is (the bundle, for the backend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const twist = parseBoardPack(fs.readFileSync(path.resolve(__dirname, '../../../../applications/electron/boardpacks/twist/board.yaml'), 'utf8'));
const buckEnvelope = { HIGH: { v_max_V: 60, i_max_A: 8 }, LOW1: { v_max_V: 20, i_max_A: 8 } };

test('buck mission on the Twist without the Safety API: voltages are gaps, currents are fused', () => {
    const checks = checkEnvelope(buckEnvelope, twist, false);
    const at = (port: string, key: string) => checks.find(c => c.port === port && c.key === key)!;
    assert.equal(at('HIGH', 'v_max_V').coverage, 'inactive');
    assert.equal(at('LOW1', 'v_max_V').coverage, 'inactive');
    assert.equal(at('HIGH', 'i_max_A').coverage, 'covered');
    assert.equal(at('LOW1', 'i_max_A').coverage, 'covered');
    assert.ok(checks.every(c => c.withinRating));
});

test('with the Safety API, the 100 V default trip is still above a 60 V envelope', () => {
    const checks = checkEnvelope(buckEnvelope, twist, true);
    assert.equal(checks.find(c => c.port === 'HIGH' && c.key === 'v_max_V')!.coverage, 'above');
    assert.equal(checks.find(c => c.port === 'LOW1' && c.key === 'v_max_V')!.coverage, 'above');
});

test('an envelope above the board rating is flagged', () => {
    const [check] = checkEnvelope({ HIGH: { v_max_V: 110 } }, twist, true);
    assert.equal(check.withinRating, false);
    assert.equal(check.rating, 100);
});

test('a port the board does not have has no rating and no chain', () => {
    const [check] = checkEnvelope({ AC: { v_max_V: 10 } }, twist, true);
    assert.equal(check.withinRating, false);
    assert.equal(check.coverage, 'none');
});

test('the Safety API call is found in code, not in comments', () => {
    assert.equal(firmwareEnablesSafety(['void f() { safety.enableSafetyApi(); }'], 'safety.enableSafetyApi'), true);
    assert.equal(firmwareEnablesSafety(['// safety.enableSafetyApi();', '/* safety.enableSafetyApi(); */'], 'safety.enableSafetyApi'), false);
    assert.equal(firmwareEnablesSafety(['safety.enableSafetyApi();'], undefined), false);
});

const MISSION = `id: x
# The envelope.
envelope:
  HIGH: {v_max_V: 60.0, i_max_A: 8.0}   # teaching profile
  LOW1: {v_max_V: 20.0, i_max_A: 8.0}

starting_state:
  HIGH: {v_max_V: 1.0}
`;

test('editing the envelope changes one number and keeps comments', () => {
    const out = setEnvelopeValue(MISSION, 'LOW1', 'v_max_V', 15);
    assert.equal(out, MISSION.replace('LOW1: {v_max_V: 20.0', 'LOW1: {v_max_V: 15.0'));
    const out2 = setEnvelopeValue(MISSION, 'HIGH', 'i_max_A', 2.5);
    assert.ok(out2.includes('HIGH: {v_max_V: 60.0, i_max_A: 2.5}   # teaching profile'));
    assert.ok(out2.includes('starting_state:\n  HIGH: {v_max_V: 1.0}'));
});

test('an envelope line in another form is refused', () => {
    assert.throws(() => setEnvelopeValue(MISSION, 'LOW2', 'v_max_V', 1), /no 'LOW2/);
    assert.throws(() => setEnvelopeValue('envelope:\n  HIGH:\n    v_max_V: 60\n', 'HIGH', 'v_max_V', 1), /no 'HIGH/);
});
