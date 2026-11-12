// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES module: where this file is (the bundle, for the backend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// From lib/common back to the package, then to the Electron application.
const APP = path.resolve(__dirname, '../../../../applications/electron');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));

// SPEC 2.0 §8: C++ and Python language support, YAML and JSON, and git, from VS Code extensions.
const REQUIRED = ['vscode.cpp', 'vscode.python', 'vscode.yaml', 'vscode.json', 'vscode.git', 'vscode.git-base',
    'llvm-vs-code-extensions.vscode-clangd', 'detachhead.basedpyright'];

test('the plugin system is part of the application', () => {
    assert.ok(manifest.dependencies['@theia/plugin-ext']);
    assert.ok(manifest.dependencies['@theia/plugin-ext-vscode']);
    assert.match(manifest.scripts.start, /--plugins=local-dir:plugins/);
});

test('the language and git extensions are bundled from Open VSX, pinned to a version', () => {
    for (const id of REQUIRED) {
        const url: string | undefined = manifest.theiaPlugins[id];
        assert.ok(url, `${id} is missing from theiaPlugins`);
        assert.match(url, /^https:\/\/open-vsx\.org\/api\/.+\/\d+\.\d+\.\d+\/file\/.+\.vsix$/, `${id} is not pinned`);
    }
});

test('downloaded extensions, when present, include every required one', { skip: !fs.existsSync(path.join(APP, 'plugins')) }, () => {
    const present = fs.readdirSync(path.join(APP, 'plugins'));
    for (const id of REQUIRED) {
        assert.ok(present.includes(id), `${id} was not downloaded (npm run download:plugins)`);
    }
});
