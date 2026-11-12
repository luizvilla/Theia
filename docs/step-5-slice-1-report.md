# Step 5, slice 1 report (2026-11-12)

Slice 1 is built as far as it can be without you: the nine steps of SPEC §2 run in one window, from the Start page to going back in time, on Theia 1.77. Codex built U1–U15 (2026-11-10 to 12); this session built U16–U19 and E21, upgraded Theia, and fixed what the gates found on the way. Every commit builds and its tests pass. The step-by-step results, with every measurement and every difference from the plan, are in [plan.md, "Work log (slice 1)"](plan.md#work-log-slice-1).

**Nothing switched the converter on in slice 1.** Every board run was tested against the deterministic fake board; the real board was not connected during this session. The only real-hardware evidence is the PlatformIO build of a setup loaded from the buck example (E21).

**Pushed on 2026-11-12:** `step-5/slice-1-thread` on `luizvilla/Theia` and `ownstudio/buck-extras` on `luizvilla/examples`.

The exit criterion is yours: **your test session** ([try-it.md](try-it.md)), and whether you find it good enough.

## What works

| Step of SPEC §2 | Plan steps | Checked by |
| --- | --- | --- |
| 1. Source, Twist and load on the canvas | U8 | navigation test (drops in each workbench), canvas rules |
| 2. The inside of the Twist | U9 | navigation test (both canvas levels), devicetree values |
| 3. Load an example | U6, U7, E21 | the example lands on its branch with its 11 files |
| 4. Build and flash | U10, E21 | real PlatformIO build (61 s, ThingSet, scope, identity); flash on a fake |
| 5. Switch on and capture | U11, U12 | checklist and capture gates on the fake board |
| 6. The simulator with the same parameters | U13, U14 | PulsimGui save gate, native C-Block |
| 7. Simulate over the measurement | U15 | overlay gate |
| 8. Change a parameter in Design | U16 | design gate: ripple follows L in 249 ms |
| 9. Again, and back in time | U18 | timeline gate: 200 restores and returns, slowest 1,044 ms |
| The AI | U17 | agents gate; Codex sandbox probe |

The gates, all passing on the final build, each on a fresh setup: navigation (657 interactions, 0 wrong, median 50 ms, p95 129 ms, slowest 247 ms), menus, checklist, capture, PulsimGui sync, simulation overlay, design, plugins, agents, timeline. 91 TypeScript tests, 135 Python tests (8 skipped where hardware or an outside tool is absent).

## What this session found beyond the plan

- **Theia 1.77 is ES modules.** The upgrade (U17a) needed `@ownstudio/core` to become one too, Electron 42 → 44 with rebuilt native modules, and a regenerated lockfile. Nothing in OwnStudio's subclasses of Theia broke. A new plugins check confirms the bundled VS Code extensions start on both versions.
- **A real board would never have shown "Firmware ✓".** A setup build reported source hash "unknown" over ThingSet, because the forced build header did not define what the firmware reads. Fixed (E21, Theia `284fcdb`); confirmed in the built image.
- **The power token is not a boundary against an agent's shell** (U17). Any process running as you can forge it, or open the serial port directly. Codex's sandbox does stop it (measured); Claude Code only asks. Written up with options in [ADR 0031](adr/0031-ai-agents-and-takeover.md); it needs your decision.
- **The Twist is a synchronous buck**: at the bench's light load the inductor current reverses each period. The Design sheet says so instead of calling it DCM.
- **One of Codex's gates had gone stale** at U15 (capture-test: a button below the fold and a renamed button); fixed and passing.
- **The plan's Order table** keeps the plan; results now go to the Work log, as you asked.

## Waiting for you

1. **Your test session**, with `scripts/try-ownstudio.sh` and [try-it.md](try-it.md). The supply on only for step 5.
2. ~~**Push**~~: done on 2026-11-12.
3. **Power and agents** (ADR 0031's open point): keep the token as a guard against mistakes, sandbox Claude Code too (my recommendation for now), and/or a service that owns the serial port (with the installer).
4. **Claude Code's SDK**: install it on your machine (`npm install -g @anthropic-ai/claude-agent-sdk`), and decide whether the installer ships it (it is under Anthropic's own terms, not an open-source licence).
5. **Codex's version**: Theia 1.77 pins Codex 0.49, which refuses your `~/.codex/config.toml` (`xhigh`). Keep it and set `high`, or let OwnStudio use your own `codex` (0.92). Either needs one real conversation with your account to confirm.
6. **The navigation rule** changed by Codex in U2: "95 % of switches within 200 ms, none above 300 ms" instead of "every switch within 200 ms". Every step since was measured against it.
7. From earlier steps, still open: the Pulsim exact-edges fork/PR, sensor calibration (#14), the supply current re-measure (#15).

## Where slice 1 departs from the storyboards

The table below puts every storyboard frame beside the app's screenshot, taken on the final build by `tools/storyboard-shots/shots.mjs`, with the differences it records. The storyboard images are rendered from [design/storyboards.html](design/storyboards.html) by `tools/storyboard-frames/main.cjs`.

### Frame 0: The window, part by part

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-00-anatomy.png) | ![app](images/step-5/frame-00-anatomy.png) |

- This first-state capture has the setup's Twist only; frames 2 and 3 add and wire its source and load. The timeline strip shows the setup's first dots.
- The Code panel is Theia's explorer (open editors, the folder, the git timeline); "My files" and the libraries list come with setups.
- The status-bar icons and the Code toolbar run the same Build, Upload and Serial actions; board identity appears when a Twist is connected.

### Frame 1: Start: choose a board

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-01-start.png) | ![app](images/step-5/frame-01-start.png) |

- The board grid comes from the board descriptions: the Twist (defined), Spin and Ownverter (not yet, "Later"), and Custom board (slice 2).
- The connected board is highlighted only when a Spin is plugged in; this shot is taken without one.
- Tutorials are listed as after slice 1, as in the frame.

### Frame 2: Drag the source, the Twist and the load

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-02-parts.png) | ![app](images/step-5/frame-02-parts.png) |

- The Lab checklist turns red without a board: this frame is about the canvas.
- The frame shows the resistor mid-drag; this stable check captures the source and resistor after both drops.

### Frame 3: Wire them; a wrong wire does not snap

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-03-rules.png) | ![app](images/step-5/frame-03-rules.png) |

- The refusal shows under the canvas for a few seconds; the frame draws it beside the wire.

### Frame 4: Open the Twist and look at its parts

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-04-inside.png) | ![app](images/step-5/frame-04-inside.png) |

- The centre shows the Design sheet of frame 13 (the frame drew a placeholder); the selected Driver and its devicetree values are complete.
- Requirement badges come when a setup carries requirements (after slice 1).

### Frame 5: Load an example: it lands on its own branch

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-05-example.png) | ![app](images/step-5/frame-05-example.png) |

- File › Examples › "Examples of the board…" opens a picker of the board's examples, grouped as the frame's submenu; the frame draws the list as a submenu.
- The example's branch shows in the status bar and the timeline strip; branch lanes are slice 2.

### Frame 6: Code: the student's files, with real language support

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-06-code.png) | ![app](images/step-5/frame-06-code.png) |

- The question is typed, not sent: tests never use the user's Claude or ChatGPT account. The answer in the frame is the storyboard's.
- Claude Code needs its agent SDK on the machine (`npm install -g @anthropic-ai/claude-agent-sdk`); the installer (#5) decides whether OwnStudio ships it.
- The Code panel is Theia's explorer with AGENTS.md and CLAUDE.md at the setup's root; "My files" first and read-only libraries come later.

### Frame 6b: Parts from the Code workbench: nothing else moves

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-6b-partscode.png) | ![app](images/step-5/frame-6b-partscode.png) |

- The canvas keeps the source, Twist and resistor wired in frames 2 and 3; the navigation test checks a drop from every workbench.

### Frame 7: Build and flash, with real progress

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-07-build.png) | ![app](images/step-5/frame-07-build.png) |

- The screenshot uses deterministic fake PlatformIO and mcumgr processes; the same service is gated below with a real buck build.

### Frame 8: The Lab checks before Run turns green

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-08-checklist.png) | ![app](images/step-5/frame-08-checklist.png) |

- The deterministic storyboard Twist reports HIGH = 0.2 V; all other live checks hold, so the one failing sentence is visible in the panel and on Run.
- The capture form fills the centre; the checklist must be 6/6 before Run turns green.

### Frame 9: The default capture from the board

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-09-procedure.png) | ![app](images/step-5/frame-09-capture.png) |

- The channels, reference step and capture window come from the Twist board description; the example adds nothing.
- The deterministic storyboard Twist reports the matching firmware and HIGH = 29.9 V, so all six checks hold and Capture is green.

### Frame 10: The capture result, opened on the event

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-10-result.png) | ![app](images/step-5/frame-10-result.png) |

- uPlot opens at −5 to +40 ms around the step; Whole run restores the complete −20 to +82 ms firmware-scope window.
- Drag zooms, Shift+wheel pans, the legend is the cursor readout, and each channel button turns its trace on or off.
- Simulate at these conditions deliberately leaves this measured-only result first; Open in PulsimGui and Report are beside it.

### Frame 11: Open in PulsimGui: the simulator's circuit

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-11-pulsimgui.png) | ![app](images/step-5/frame-11-pulsimgui.png) |

- This is the real PulsimGui 1.1.1 native window, so its current toolbar and dock layout replace the storyboard's illustrative chrome.
- The stable load capture keeps the circuit full width; Properties opens when a part is selected and Waveforms opens after Run.
- The C-Block and PWM markers are visible below the physical circuit; OwnStudio's runner supplies their native control and hardware-adapter behavior.

### Frame 12: Simulation over the measurement, at the same conditions

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-12-overlay.png) | ![app](images/step-5/frame-12-overlay.png) |

- The native switching model runs the same capture procedure only after Simulate at these conditions is pressed; the board result is visible first.
- The solid amber measurement and dashed blue simulation share a trigger-aligned time axis; the table compares every captured metric.
- The Simulate-tint fidelity chips shown in the storyboard arrive with the simulation sheet in slice 2.

### Frame 13: Design: change a parameter on a live sheet

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-13-design.png) | ![app](images/step-5/frame-13-design.png) |

- The sheet is the setup's own ownstudio/design/output_filter.py; "Show the formulas" opens it. The frame's C of 61 µF counted the electrolytic; the sheet's C is the ceramics the plant calls C (14.1 µF), the electrolytic stays in the plant.
- The frame's undershoot verdict needs the buck's requirements, which no setup carries yet; the sheet shows the passive dip for the load step instead.
- The Inspector keeps its block selection; the frame selected Power. The design dot appears on the timeline.

### Frame 14: Run again; go back in time; branch

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-14-timeline.png) | ![app](images/step-5/frame-14-timeline.png) |

- The preview opens in the centre and the dot's details in the Inspector, as drawn; the frame's kp row comes from the diff here (src/control.cpp differs when the code changed).
- Open its report waits for run dots that name their report; reports are listed in the Lab. Milestone… shows on the current dot only.
- Branches follow the strip (a restore then an edit starts one, and the strip shows it); lanes under the strip are slice 2.

### Frame 15: The eight menus

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-15-menus.png) | ![app](images/step-5/frame-15-menus.png) |

- The frame draws all eight menus side by side as a map; the app opens one at a time (File here). menus-test.mjs checks every menu against the map.
- Items not built yet carry "(slice N)", including those of slice 1; each drops it when its plan step lands.
- File › Open recent opens Theia's recent-folders picker rather than a submenu.

### Frame 16: The AI: your own agent, and the takeover button

| Storyboard | OwnStudio |
| --- | --- |
| ![storyboard](images/step-5/storyboard/frame-16-ai.png) | ![app](images/step-5/frame-16-ai.png) |

- Codex is addressed and its sandbox menu shows Workspace (Read-Only is the other choice; Full Access is removed, plan U17). The question is not sent.
- AI takeover and its token are slice 4; the Lab shows Run only.
- Skills (owntech-setup, twist, buck-tuning) come later; the setup carries the Twist's AGENTS.md now.
