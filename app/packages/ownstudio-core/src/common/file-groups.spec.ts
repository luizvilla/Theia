// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { appOrder, codeOrder, fileGroup } from './file-groups.js';

// The files of Luiz's trial setup (2026-11-19), group by group.
test('F9: your code is main and control, and any file you add in src', () => {
    for (const f of ['src/main.cpp', 'src/control.cpp', 'src/control.h', 'src/filters.cpp', 'src/lib/notch.h']) {
        assert.equal(fileGroup(f), 'code', f);
    }
});

test('F9: the app is the template\'s part of src, scope included, and the OwnStudio models', () => {
    for (const f of ['src/app.conf', 'src/app.ini', 'src/app.overlay', 'src/scope.cpp', 'src/scope.h', 'src/data_objects.cpp',
        'src/data_objects.h', 'src/build_identity.cpp', 'ownstudio/design/control_loop.py', 'ownstudio/plant/twist_buck.pulsim',
        'ownstudio/plant/control_block.cpp']) {
        assert.equal(fileGroup(f), 'app', f);
    }
});

test('F9: agents, licence, PlatformIO, west, tools and records are hidden until Show all files', () => {
    for (const f of ['AGENTS.md', 'CLAUDE.md', 'LICENSE', 'README.md', 'platformio.ini', 'west.yml', '.clangd', 'compile_commands.json',
        '.claude/settings.json', 'ownstudio/setup.yaml', 'ownstudio/origin.yaml', 'ownstudio/plant/twist_buck.pulsim.bak', 'ownstudio/plant/shim/arm_math.h',
        'ownstudio/records/2026-11-19/record.json', 'ownstudio/reports/a.html', 'zephyr/CMakeLists.txt', 'owntech/lib/x.cpp']) {
        assert.equal(fileGroup(f), 'hidden', f);
    }
});

test('F9: main.cpp and control.cpp come first in your code', () => {
    assert.deepEqual(['src/filters.cpp', 'src/control.h', 'src/control.cpp', 'src/main.cpp'].sort(codeOrder),
        ['src/main.cpp', 'src/control.cpp', 'src/control.h', 'src/filters.cpp']);
});

test('F9: in App, the template\'s src files come before the OwnStudio models', () => {
    assert.deepEqual(['ownstudio/design/control_loop.py', 'src/scope.cpp', 'src/app.conf'].sort(appOrder),
        ['src/app.conf', 'src/scope.cpp', 'ownstudio/design/control_loop.py']);
});
