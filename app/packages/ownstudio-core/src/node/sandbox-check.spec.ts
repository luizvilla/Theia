// SPDX-License-Identifier: LGPL-2.1-only
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { SandboxProbe, installSandboxTools, sandboxStatus } from './sandbox-check.js';

const UBUNTU = 'NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n';
const FEDORA = 'NAME="Fedora Linux"\nID=fedora\n';
const linux = (have: string[], osRelease = UBUNTU): SandboxProbe => ({ platform: 'linux', has: cmd => have.includes(cmd), osRelease: () => osRelease });

test('#51: on Linux the sandbox needs bwrap and socat; on Ubuntu with pkexec the Install button works', () => {
    assert.deepEqual(sandboxStatus(linux(['bwrap', 'socat', 'apt-get', 'pkexec'])), { supported: true, missing: [], packageManager: 'apt', canInstall: true });
    assert.deepEqual(sandboxStatus(linux(['bwrap', 'apt-get', 'pkexec'])).missing, ['socat']);
    assert.deepEqual(sandboxStatus(linux(['apt-get', 'pkexec'])).missing, ['bubblewrap', 'socat']);
});

test('#51: no Install button without pkexec, or off Debian and Ubuntu', () => {
    assert.equal(sandboxStatus(linux(['apt-get'])).canInstall, false);
    const fedora = sandboxStatus(linux(['dnf', 'pkexec'], FEDORA));
    assert.equal(fedora.packageManager, 'dnf');
    assert.equal(fedora.canInstall, false);
});

test('#51: macOS needs nothing, Windows has no sandbox', () => {
    assert.deepEqual(sandboxStatus({ platform: 'darwin', has: () => false, osRelease: () => '' }), { supported: true, missing: [], canInstall: false });
    assert.equal(sandboxStatus({ platform: 'win32', has: () => false, osRelease: () => '' }).supported, false);
});

test('#51: the Install button runs apt-get through pkexec for the missing packages only, and reads a dismissed dialog as cancelled', async () => {
    const calls: string[][] = [];
    const run = (code: number) => async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); return code; };
    assert.equal(await installSandboxTools(['socat'], run(0)), 'done');
    assert.deepEqual(calls[0], ['pkexec', '/usr/bin/apt-get', 'install', '-y', 'socat']);
    assert.equal(await installSandboxTools(['socat'], run(126)), 'cancelled');
    assert.equal(await installSandboxTools(['socat'], run(100)), 'failed');
});
