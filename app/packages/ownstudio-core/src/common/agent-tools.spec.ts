// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { editablePath, readablePath, summarizeRun, summarizeTestStates } from './agent-tools';
import { TestStates } from './test-states';

test('reads only inside the mission', () => {
    assert.equal(readablePath('firmware/control.cpp'), 'firmware/control.cpp');
    assert.equal(readablePath('./requirements.yaml'), 'requirements.yaml');
    for (const bad of ['../secret', '/etc/passwd', 'a/../../b', 'records/x/record.json', 'bin/firmware.mcuboot.bin', '.git/config', '']) {
        assert.equal(readablePath(bad), undefined, bad);
    }
});

test('proposes changes to the control law only', () => {
    assert.equal(editablePath('firmware/control.cpp'), 'firmware/control.cpp');
    for (const bad of ['mission.yaml', 'firmware/main.cpp', 'requirements.yaml', 'data_objects.yaml']) {
        assert.equal(editablePath(bad), undefined, bad);
    }
});

test('test states as short text', () => {
    const states: TestStates = {
        tabs: [], unknown_cases: [], campaigns: [],
        tests: [{ id: 'B-01b', tab: 'loop', level: 'L1', title: 'undershoot', criterion: '≥ 95 %', status: 'implemented',
            target: 'simulator', state: 'known', finding: { issue: 'https://x/issues/11', cause: 'c' },
            latest: { date: '', campaign: 'c', path: '/r', target: 'simulator', cases: [{ id: 'B-01b', title: 't', measured: 11.32, unit: 'V', passed: false }] } }],
        requirements: [{ id: 'REQ-U', title: 'Undershoot', state: 'known', tests: ['B-01b'] }],
        findings: [],
    };
    const text = summarizeTestStates(states);
    assert.match(text, /Failing \(known\): B-01b .* B-01b 11\.32 V FAIL \[known issue https:\/\/x\/issues\/11\]/);
    assert.match(text, /REQ-U \(Undershoot\): known/);
});

test('a run as short text', () => {
    const text = summarizeRun({ title: 'Step', target: 'simulator', status: 1, log: ['a', 'b'], records: [{ path: '/m/records/c/step', verdict: 'FAIL' }] });
    assert.match(text, /a criterion failed/);
    assert.match(text, /record c\/step: FAIL/);
});
