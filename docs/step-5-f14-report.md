# F14: the nine steps, run through the app (2026-11-19)

Claude ran the nine steps of [try-it.md](try-it.md) through the app's driver before Luiz's retest (Q187). The environment was the same as `scripts/try-ownstudio.sh`: a fresh OwnStudio home, the local Core mirror, the real PlatformIO, the examples on `ownstudio/buck-extras`, and the app's Python with exact-edges Pulsim. Each step started the app on the same setup, `f14-bench`. Screenshots are in `/data/ownstudio/build/f14/shots/`, kept local like the storyboards. Logs are in `/data/ownstudio/build/f14/step-*.log`.

**Result:** steps 1, 2, 3, 6 and 7 and the window check pass in full. Step 4 passes, except the upload, which waits for Luiz. Step 8 and the AI tab pass. Step 9 works but misses its speed target on this setup. Step 5 is Luiz's. Two bugs were found and fixed; four items are open.

| Step | What the driver did | Result | Screenshot |
|---|---|---|---|
| 0 | Start page | The Twist is offered; the Spin on it is detected | `step-0-start` |
| 1 | **New setup on the Twist**, name, Enter | Stages named (1/3 Core, 2/3 create, 3/3 open); canvas in **7.1 s** (Q188: accepted) | `step-1a-new-setup` |
| 1 | DC source and resistor from Parts; a resistor on HIGH; then the right wires | The Twist alone at first; the wrong wire does not snap and says "A load can only connect to LOW1 or LOW2. HIGH takes the source."; two wires; one canvas dot; the canvas stays at the bottom in Design, Lab and Code | `step-1b-wrong-wire`, `step-1c-canvas` |
| 2 | Double-click the Twist, click Driver | Five blocks, names only, on the grid; Driver: HRTIM, 200 kHz, 100 ns / 100 ns, up-down; Inspector offers Design, Code, Tests | `step-2-inside` |
| 3 | File › Examples › Examples of the board…, "Buck with PID controlled output voltage" | 22 examples, titles only; branch `buck-voltage-mode` in the status bar; the first branch kept; Your code = main.cpp, control.cpp, control.h | `step-3a-examples`, `step-3b-example` |
| 4 | Open control.cpp, Board › Build (real PlatformIO) | Coloured (7 colours); **Build b05d85b3 ✓ 77 s**, SUCCESS green; the Twist on the canvas shows the build. **Upload not done** (see open items) | `step-4a-build`, `step-4b-lab` |
| 5 | Supply on, capture | Luiz's | — |
| 6 | Lab › Open in PulsimGui; then a PulsimGui-style save of Rload | PulsimGui runs on the setup's plant at the canvas's 30 V and 33 Ω; the save of Rload 22 Ω shows on the canvas | `step-6a-pulsimgui`, `step-6b-saved` |
| 7 | Lab › Simulate | Runs at the canvas's values with progress ("Simulated 2.0 of 100 ms · about 2 min left"), result in 149 s; drawn over a measurement needs step 5's | `step-7a-progress`, `step-7b-result` |
| 8 | `design-test` on the setup | Ripple follows L live (269 ms); 47.5 µH on the canvas and in setup.yaml, one dot; Kp tried without writing, Apply writes only Kp; the link names line 15 | `step-8a-output-filter`, `step-8b-control-loop` |
| 9 | `timeline-test` (on a copy taken before step 8, as it checks absolute values) | Restore and Back to latest bring back canvas and code, open editor included; an edit from an old dot starts `buck-voltage-mode-from-aa90cf4`. **But:** 200 moves, median 1.3 s, p95 4.2 s, slowest 5.3 s (limit 2 s), 2 did not land, one uncaught "cancelled" error | `step-9-preview` |
| AI | `agents-test` | Claude Code and Codex offered, no Full Access, AGENTS.md in the setup. No prompt sent (Luiz's account) | — |
| W | The window | The eight menus; Design, Code, Lab | `step-w-window` |

## Found and fixed during the run

- **A PulsimGui save named values it had not changed.** In the trial's setup the Twist has no L or C of its own; the canvas shows the defaults. Saving Rload alone made the dot "PulsimGui changed Rload, L, C" and wrote the defaults into the canvas. Fixed in `74a4622`, with a test that fails before the fix.
- **try-it.md named an example the picker does not show.** It said "buck voltage mode"; its title is "Buck with PID controlled output voltage" (+ OwnStudio extras). Fixed in the same commit.

## Open

1. **Upload on the Twist, not done.** At 20:36 the Twist's Spin (`…0041`) re-enumerated and now runs another firmware. That firmware reports no OwnStudio build and has no `Measurements` group, so the supply cannot be confirmed off. Another Spin (`…0031`, product `SPIN`) is plugged in too; earlier in the evening a `pio run -e SAFETY_TIME -t upload` came from another project. The driver did not overwrite a board someone may be using. With Luiz's OK it is one more run: Board › Select board… `…0041`, Upload, then the Lab's Firmware line.
2. **Restore speed on a real setup** (step 9). Fixed in `bf9e79b` (F17): a move now starts Python once instead of five times, and the canvas draws before the devicetree details. All 200 moves land now (2 missed before). The timings, median 1.43 s and p95 3.3 s, were taken while other work held the machine at load 13–19, so they need a quiet machine before they can be compared with the 2 s target.
3. **The window title keeps the last centre view's name.** In Code it still said "Lab – f14-bench".
4. **The editor area is empty when a setup opens in Code.** This is the logo idea, already in slice 2.

## The simulation time step (Q191)

The 100 ms step-response run of the step-4 comparison (buck example, 40 V, 12 Ω → 24 Ω), at several fixed steps, all with exact edges. The four metrics and their tolerances are those of `test_step_response_matches_the_step4_harness`.

| Step | Run time | Settled LOW1 (V) | Lowest after the step (V) | Settling (ms) | Ripple (mV) |
|---|---|---|---|---|---|
| step-4 harness (accepted) | — | 11.9926 | 11.6518 | 0.0643 | 58.0 |
| tolerance | | ±0.05 | ±0.10 | ±0.25 | ±15 |
| **25 ns (today)** | 154 s | 11.9924 | 11.6516 | 0.0643 | 58.0 |
| 50 ns | 119 s* | 11.9912 | 11.6507 | 0.0644 | 57.9 |
| **100 ns** | **45 s** | 11.9886 | 11.6483 | 0.0644 | 57.7 |
| 200 ns | 31 s | 11.9826 | 11.6470 | 0.0640 | 69.2 |
| 400 ns | 16 s | 11.9754 | 11.6336 | 0.0656 | 57.7 |

Run times are for the simulation alone, one at a time, on a machine with a load average of 7–10 from other work, so they are noisy. *The 50 ns run was timed when the machine was busier.

**Reading.** All five steps stay within the step-4 tolerances. At **100 ns**, every metric is within 0.004 V and 0.3 mV of 25 ns, for about **3.4× less time**. That brings the 100 ms capture from about 2.5 min to under 1 min. At 200 ns the ripple jumps to 69 mV (+19 %), because the ripple is what a coarse step resolves worst. 400 ns lands back on 57.7 mV, but by chance: its voltages are already drifting.

**Done** (`6eb6514`, Luiz's OK): 100 ns in the Twist's plant (`boards/twist/plant/twist_buck.pulsim`, `dt` and `max_step`), with the step-4 comparison test as its gate. New setups get it; existing setups keep their own plant.
