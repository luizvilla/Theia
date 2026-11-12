---
status: accepted, for slice 3
date: 2026-11-13
---

# The control code's timing on the Spin: a live load gauge and a Timing check, both over USB

A student's critical task has to finish within its control period (100 µs in the Twist examples). Nothing in OwnStudio says when a change makes it too slow. The first sign is a board that misbehaves. Core2 solved this for its own firmware with on-target timing tests (Core2 ADR 0005, `tests/l0/timing/`): DWT cycle-counter probes that compile only in a `TIMING` PlatformIO env, results in a RAM structure read over SWD, an 80 µs budget, a committed baseline, and a review page whose stacked bars break the period down by contribution. That work found and removed about 50 µs per period in a few days, with the AI agent changing one thing at a time and reading the verdicts. OwnStudio takes the idea and adapts it to a student with a Twist on USB and no ST-Link (decision log round 22).

## Decision

**Two levels.**
- **Load gauge (always on).** The OwnTech task API measures each critical-task run with the cycle counter and publishes four built-in ThingSet data objects: `load_max_us` (worst run since the last read), `load_mean_us`, `lost` (lost periods) and `gap_max_us`. They are built in, not declared in the user's `data_objects.yaml`. Monitor polls them at about 10 Hz. The status bar shows the **worst case** as a percentage of the period: green below 60 %, amber from 60 % up to the budget, red above it, and red with a counter as soon as `lost` > 0. The same number is a badge on the Controller block in the Twist's inside view. Firmware that doesn't publish these objects shows a grey gauge reading "no data", with a tooltip saying which firmware adds it. No console text is parsed.
- **Timing check (on request).** A procedure builds the setup's firmware in a `TIMING` image (probes compiled in, nothing else changed), flashes it over USB through MCUboot, walks the firmware's states through ThingSet writes, reads the report over ThingSet, checks it, files a record and puts the user's firmware back.

**What runs.** The user's own firmware runs unchanged, with its interrupts and the real control period. This is the equivalent of Core2's L0-TIM-03, not a hand-written harness. PWM outputs are inhibited at the HRTIM output stage: the timers and the duty writes run, and the pins stay low. Sensors are real, so near zero on an unpowered Twist. A Timing check never asks for the power token. Replaying the simulator's trace into the DataAPI on the target is deferred, because target memory and USB bandwidth at 10 kHz are open questions. A section-by-section mode with interrupts locked (Core2's L0-TIM-01) is a later developer option.

**Sections.** There are two sources of sections:
- **automatic groups** from probes in the task API and the data path: safety check, ADC dispatch, sensor reads, the user's critical task, PWM writes;
- **user sections** named with `OWN_TIMING("name")`, which times from that line to the end of its block.

Both compile to nothing outside the `TIMING` image. Whatever no probe covers is drawn in grey, so a bar always adds up to the measured total.

**Report over ThingSet.** The firmware fills the report in RAM: sections × {mean, worst, count}, lost periods, longest gap, and a layout version. It serves the report only after the measurement is complete, so reading never disturbs it. This plays the role SWD plays in Core2. Framed console lines were rejected: one protocol is easier to version than two.

**Budget.** 80 % of the control period, read from the setup function's control period, editable per setup in the inspector. If the code doesn't state a period, the run says so and gives no verdict.

**Criteria** (Core2's form):
- `.a` every state reached;
- `.b-<state>` worst tick ≤ budget;
- `.c` no lost period;
- `.d` no section above the previous run by more than 10 % + 50 cycles;
- INFO: the mean interrupt time per period.

**Record and report.**
- Each Timing check is a test record under `reports/timing/<date>_<commit>/` (`record.md`, `timing.json`, `report.html`) and a timeline dot with a stopwatch icon, green or red by verdict.
- The report page **leads with the figure**. Verdicts, conditions, the target snapshot and the tables follow as collapsible sections (Luiz, Q22: Core2's pages were too long to scroll).
- The Timing tab, a bottom tab, is the live view of the newest record. It has three views:
  - an overview: one bar per state, verdict first;
  - a detailed view at 40 px per µs with every segment named;
  - a table.
- Each run is drawn with the previous run's bar paired above it and the step in µs beside it. "Compare with…" picks any earlier timing dot.
- A CodeLens above each `OWN_TIMING` line gives the last run's mean, worst and share of the budget.

**Firmware match.** While the TIMING image is on the board, the status bar's firmware match reads "TIMING image" in amber and the Lab checklist refuses power runs. If a run stops before the user's firmware is back, the next connection offers to put it back.

**AI agents** may run a Timing check: it reflashes but never switches power on. The setup's `AGENTS.md`/`CLAUDE.md` carries the recipe: how to run it, how to read the verdicts, change one thing at a time, rerun, compare. Without that recipe the raw numbers are hard to interpret (Luiz, Q7).

**Where the probe code lives.** The probes, the load objects, the `TIMING` env and the output inhibit go into Luiz's fork of the Spin API (where Core2's task API and data path probes already are) until the integration has been tried. Upstreaming to OwnTech, after review with Jean Alinei, comes after that. OwnStudio injects the `OWN_TIMING` header at build time, as it injects the identity macros, so examples need no change.

**Colours.** One fixed hue per group, in bar order. Named sections take shades of their group's hue, darkest first in code order. Amber and blue are left out because they mean measured and simulated everywhere else (SPEC §9).

| Group | Colour | Shades in use |
|---|---|---|
| Task API (safety check, ADC dispatch) | aqua | `#147a57`, `#199e70` |
| Sensor reads | violet | `#9085e9` |
| The user's critical task | magenta | `#a8345f`, `#d55181`, `#e58aae` |
| PWM writes | green | `#008300` |
| Not probed | neutral grey | `#5d6e69` |

The four hues were checked with the dataviz palette validator (`validate_palette.js --mode dark`) on the three workbench tints: Design `#1f2a3a`, Code `#1f2427`, Lab `#2a2419`. In this order they pass every check on all three:
- worst colourblind separation between neighbours ΔE 13.0;
- worst normal-vision difference ΔE 19.7;
- contrast at least 3:1, except green on the Design tint (2.93:1).

That one warning is covered by the legend and the table view that the Timing tab always shows. Two other orders and a slate task-API colour failed: slate reads as grey and sits too close to green. The magenta for the user's code is the one hue nowhere else in the app. Violet and green also appear on the timeline (design events, runs). The overlap is accepted: the timeline uses lighter tints on small dots, and timing bars always carry a legend. The gauge's green, amber and red are status colours, always shown with a label or a ▲. They are not series colours.

## Considered options

- **The console's `load` line, as Core2's bench reads it:** no breakdown, and it depends on console text that ADR 0019 removes.
- **A per-application harness with synthetic inputs, as Core2's TIM-01/02:** precise, but C code written by hand for each firmware, which a student can't do. Kept for later as a developer mode.
- **SWD with an ST-Link:** the precise path, and Core2's. Students don't have the probe. See ADR 0035.
- **GPIO toggling and an oscilloscope:** manual, not repeatable as a check.
- **Live gauge plus a Timing check over USB and ThingSet:** chosen.

## Consequences

- The firmware side (T1 in the slice 3 plan) is Spin API work in Luiz's fork and has to be measured itself: the probe cost per read (Core2 measured about 2.5 µs for five reads with three sums each) is reported, and the baseline includes it.
- The buck voltage-mode example already speaks ThingSet, so it gets the gauge as soon as the fork publishes the load objects. Most of the other examples still use serial menus: in slice 3 only the Twist examples the tutorials use are converted. A generic ThingSet example, and a few like it, may follow, because ThingSet by hand proved hard to use (Luiz's `thingset_examples` branch of the examples repository). Converting all 38 is OwnTech's work, not OwnStudio's.
- Acceptance on the unpowered Twist (slice 3 plan):
  - a Timing check of the buck example finishes in under 2 minutes;
  - two runs of the same code agree within 0.1 µs on the means;
  - every bar adds up to its measured total;
  - the gauge's worst case agrees with the run's worst tick for the same state within 5 %;
  - the user's firmware is back at the end, which the firmware match confirms.
- The report format and the procedure don't assume USB, so an SWD path (ADR 0035) can feed the same report.
- Storyboard frames T-1 to T-9 (`docs/design/timing-storyboard.html`, kept local) are the reference for the window commits.
