#!/usr/bin/env node
// SPDX-License-Identifier: LGPL-2.1-only
// Deterministic board-free mcumgr stand-in for storyboard frame 7.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
console.log('Board 58435001004B001E (MCUBOOT); image 5a5a5a5a5a5a5a5a');
console.log('Uploading…');
for (const written of [32768, 65536, 98304, 131072, 163840]) {
    await sleep(850);
    console.log(`Uploading ${written} / 163840 bytes`);
}
console.log('Restarting the board…');
await sleep(350);
console.log('Done: board 58435001004B001E runs TWIST_V1_4_2');
