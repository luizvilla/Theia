#!/usr/bin/env node
// SPDX-License-Identifier: LGPL-2.1-only
// Deterministic U10 storyboard tool: it behaves like the small part of
// PlatformIO the shots exercise and leaves a flashable image behind.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
if (process.argv.includes('clean')) {
    rmSync('.pio/build', { recursive: true, force: true });
    console.log('Removed .pio/build');
    process.exit(0);
}
console.log('Processing USB (platform: ststm32; board: spin; framework: zephyr)');
await sleep(250);
console.log('Compiling .pio/build/USB/src/control.cpp.o');
await sleep(300);
console.log('Compiling .pio/build/USB/src/main.cpp.o');
await sleep(300);
console.log('Linking .pio/build/USB/firmware.elf');
console.log('RAM:   [==        ]  21.4% (used 28016 bytes from 131072 bytes)');
console.log('Flash: [===       ]  30.1% (used 157804 bytes from 524288 bytes)');
mkdirSync('.pio/build/USB', { recursive: true });
writeFileSync('.pio/build/USB/firmware.mcuboot.bin', Buffer.alloc(160 * 1024, 0x5a));
