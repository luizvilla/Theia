# Decision log

Every question asked during the specification sessions, the recommendation made, and the answer given. Newest round last. Decisions that are hard to reverse are also recorded as [ADRs](adr/).

## Starting brief (2026-11-06)

A Theia application for power electronics, inspired by contemporary multi-workspace software (video editing), with three workbenches:

- **Design**: turn ideas into specifications, estimate open- and closed-loop behaviour, design the control.
- **Code**: turn the design into embedded software (state machines and so on), either as text code (as in VS Code with the OwnTech Power API) or through AI-assisted or visual programming (Node-RED style).
- **Lab**: validate the converter, both by simulation that runs the code and by experiments that drive instruments, through Python scripts, notebooks, AI-assisted or visual programming.

It should merge the current VS Code + Power API experience with the Pulsim firmware-in-the-loop work (Core2, branch `test/microinverter-validation-v2`, ADR 0001 there) into one interface.

Critique raised before round 1: the three workbenches were split by tool rather than around one shared object. Simulation appeared in both Design and Lab, and the authoring styles appeared in both Code and Lab.

## Round 1 (2026-11-06)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q1 | Who is v1 for? | OwnTech learners growing into researchers; not industry. | Prototype tested with students, teaching colleagues, research colleagues and PhD students. Only the PhD students know OwnTech. | this log |
| Q2 | OwnTech-only hardware? | Yes, with a target seam for later. | Yes. Could be Twist-only if simpler. | [ADR 0001](adr/0001-owntech-only-scope.md) |
| Q3 | One shared converter project? | Yes, plain files in git. | Yes. A converter is described by five blocks: power, measurement, control, driver, feeder. | [ADR 0002](adr/0002-one-shared-converter-project.md), glossary |
| Q4 | Simulation as a target, not a workbench? | Yes. | Yes. | [ADR 0003](adr/0003-simulation-is-a-target-not-a-workbench.md) |
| Q5 | Text + AI, no visual programming in v1? | Yes. | Yes. | [ADR 0004](adr/0004-text-plus-ai-no-visual-programming-in-v1.md) |
| Q6 | Custom Theia app rather than VS Code extensions? | Yes. | Yes. | [ADR 0005](adr/0005-custom-theia-application.md) |

### Consequences of round 1 that later rounds must resolve

- Most v1 testers do not know OwnTech, so the first-run experience cannot expose PlatformIO, Zephyr or the raw file tree.
- The five-block description raises boundary questions: which block owns the ADC, PWM generation and dead time; whether "feeder" is the right word; where the source and load sit.
- If v1 is Twist-only, the hardware is fixed, and it is unclear what the Design workbench designs.

## Round 2 (2026-11-06)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q7 | Where are the block boundaries? | At the pins; whole MCU in Control. | Power: switches, filters, safety devices (fuses, relays, PTCs), connectors, thermal interfaces, hot side of sensors. Measurement: conditioning/amplification up to the MCU pin. Control: MCU, ADCs, industrial informatics incl. outside communication, PWM generation, relay/trip actuation. Driver: PWM to switches, bootstrapped or not, switch-dependent. Feeder: centre, auto-start, filtering for a quiet DGND, protection. The isolation barrier's place depends on converter type and standards. | glossary, [reference drawing](images/five-blocks-reference.png) |
| Q8 | Rename feeder? | Auxiliary supply; describe only in v1. | Yes, **auxiliary power supply (APS)**. Luiz will keep saying "feeder" for a while. | glossary |
| Q9 | Add an Environment outside the converter? | Yes: source, load, instruments; comms stay in Control. | Yes. Power flows from somewhere to somewhere; the outside-world link through Control is missing from the drawing. "Control" may need a better name. A second, non-canonical reference drawing was supplied. | glossary, [reference drawing](images/environment-reference-software-defined-converter.png) |
| Q10 | Twist-only, no hardware sizing in v1? | Yes. | **No.** Either expose the Twist's sizing or start from the Ownverter (no output filter). The user study must give feedback on Design's breadth and depth. | [ADR 0006](adr/0006-design-workbench-includes-hardware-sizing.md) |
| Q11 | Desktop only for v1? | Yes. | Yes, as frictionless as possible. | [ADR 0007](adr/0007-desktop-only-v1.md) |
| Q12 | Block diagram as home, IDE opt-in? | Yes, like Arduino IDE 2. | Yes. It must be a landing page that makes people want to go on. | glossary (Home) |

## Round 3 (2026-11-06)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q13 | Rename the control block? | "Digital block". | Some people think analog rather than digital. Proposed "industrial informatics block". **Open**, back in round 4. | — |
| Q14 | Power ports instead of source/load? | Neutral port names. | Yes to power ports. High/low voltage side (used in the past, and in the OwnTech API: `V_HIGH`, `V1_LOW`, `V2_LOW`) should be a property of the port, since it is ambiguous as a name. | glossary |
| Q15 | Protection as a chain across blocks? | Yes. | Tends to agree. How does this relate to what standards require for isolation, and how is it kept distinct from isolation itself? **Partly open.** | glossary (Protection chain) |
| Q16 | One safety envelope enforced everywhere? | Yes, in four places. | Yes, and go further: select standards that give the envelope's maximum ratings. Isolation will come up; should isolation be part of a safety block? Where would it sit? Should safety be shown over the functional blocks as "requirement blocks"? **Extension open.** | [ADR 0009](adr/0009-one-safety-envelope.md) |
| Q17 | Twist or Ownverter for v1? | Twist. | Twist. | [ADR 0008](adr/0008-twist-first.md) |
| Q18 | Clickable mock-up before the real pipeline? | Yes; real pipeline is months. | Yes to a mock-up first. Disputes "months": the Pulsim integration took a few prompts with AI assistance. | this log |
| Q19 | Online data platform out of v1? | Yes. | Yes. The second drawing was only a reference. | this log |
| Q20 | AI autonomy levels? | Free / confirm / never. | Yes, plus: a human can grant the AI the right to run automated tests, by setting the bench current and voltage limits after the AI has proposed and confirmed them. | [ADR 0010](adr/0010-ai-agent-autonomy-levels.md) |
| Q21 | Landing page with guided missions? | Missions, recent, blank. | Tends to agree; asked how competitors do it. Answered in round 4. | — |

## Round 4 (2026-11-06)

Competitor landing pages (answer to Q21): CCS 20 shows a Get Started view that detects a connected TI board and points to Resource Explorer examples (TI advises against blank projects). Simulink's Start Page has templates, examples and a Learn tab with the ~3 h Onramp course that saves progress. Typhoon has a launcher plus Example Explorer and the online HIL Academy. Arduino IDE 2 opens a blank sketch with examples in a menu. PLECS and imperix rely on demo models and online knowledge bases. No one offers guided paths that end in a real hardware result.

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q13 | Name of the block that runs control? | Controller block; "control law" for the discipline. | Controller is fine. | glossary |
| Q22 | Envelope, protection, isolation as three concepts; isolation as an attribute of the bridge blocks? | Yes. | Yes, three separate concepts. But how are they handled without three added elements that make it too complex? **Handling open.** | glossary (Bridge block, Isolation barrier) |
| Q23 | Safety as a red overlay in a requirements layer, not a block? | Two layers: build and requirements. | Likes two layers, but things tend to come in threes: what is the third layer, if any? **Open.** | — |
| Q24 | One curated low-voltage teaching profile, indicative only? | Yes; which standards do colleagues use? | OK. Teaching colleagues do not work with specific standards, so this is an added advantage. | [ADR 0009](adr/0009-one-safety-envelope.md) |
| Q25 | Unattended-run right granted per campaign, limits read back, revoked by any trip? | Yes. | Yes. | [ADR 0010](adr/0010-ai-agent-autonomy-levels.md) |
| Q26 | Mock-up as the real Theia app with canned data that turns into the skeleton? | Yes, with a fixed date. | Yes. A few discussions with colleagues, and a **working skeleton in about one month** to test with students. | [ADR 0012](adr/0012-mock-up-grows-into-skeleton.md) |
| Q27 | Which OS? | Windows + Linux. | Mostly Windows, PhD students included; Linux too. macOS later (one client uses it, not her students). | [ADR 0011](adr/0011-windows-first-linux-second.md) |
| Q28 | Board detection and saved mission progress? | Yes. | Yes. Also check the hash of the code on the board (as in the test bench) and ship pre-built binaries (as modular does). | this log |

New question raised by Luiz: should modular (ThingSet, binary upload, dashboards, buttons) inspire the Lab? Findings: modular is an Electron + Freeboard desktop app with serial and ThingSet-over-CAN data sources, uPlot plots, CSV recording, mcumgr flashing and JSON dashboards. A Theia migration of modular was already started (`owntech_extension_overhaul` branch, Theia 1.71.1, Electron app, `modular-dashboard` plugin, implementation journal for phases 0 to 2). `test_bench_code` ships a pre-built `spin_code_compiled.mcuboot.bin`. Taken up in round 5.

## Round 5 (2026-11-06)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q22/Q23 follow-up | Third layer "Evidence"? | Requirements / Build / Evidence. | Likes the idea, doubts the word: "Evidence"? "Data"? "Validation"? Maybe "Specs, Build, Validation", or V-model naming. **Naming open.** | — |
| Q29 | One safety panel: envelope edited, isolation switches suggested, protection checklist derived? | Yes. | Yes. | this log |
| Q30 | Three layers on Home, evidence coloured by latest test record? | Yes. | Yes (naming open, see above). | this log |
| Q31 | One app with modular? | Yes, built on modular's Theia branch, agree with Jean. | Yes, this app aggregates the whole workflow and will retire modular; a modular-like part goes into Lab. The Theia experiment in the modular folder is abandoned. Jean follows modular's progress. | [ADR 0013](adr/0013-one-app-retires-modular.md) |
| Q32 | Panels and procedures, no logic in panels? | Yes. | Yes: procedures are like scripts; panels monitor incoming data and trigger outgoing signals. | [ADR 0014](adr/0014-lab-panels-and-procedures-over-one-data-object-table.md), glossary |
| Q33 | ThingSet as the single variable dictionary, simulator speaks it too? | Yes. | Yes; makes it easy to amend data for a given development. | [ADR 0014](adr/0014-lab-panels-and-procedures-over-one-data-object-table.md), glossary |
| Q34 | Build identity, comparison on Home, pre-built mission binaries? | Yes. | Yes. | glossary |
| Q35 | How do Windows students compile for the simulator? | Bundle a portable host compiler. | (a), bundle it. Asked whether this is a solved problem or a real limitation. | [ADR 0015](adr/0015-bundled-host-compiler.md) |
| Q36 | One mission for the skeleton? | "Hold 12 V on the Twist". | One mission, based on the existing Twist buck voltage-mode example (`examples/TWIST/DC_DC/buck_voltage_mode`). Basing missions on examples opens the way to turning all examples into missions later. | glossary (Mission) |

Findings after round 5:

- **Windows is solved, not yet implemented.** Pulsim 2.0.0 ships `win_amd64` wheels and loads the firmware block with `ctypes.CDLL`, which accepts a `.dll`. What blocks Windows is Core2's `build.sh` (bash, `g++ -shared`, `-fsanitize=undefined`) and the absence of a compiler on student machines. Pulsim's inline compile path also assumes GCC-style flags and names its cache files `.so`, which is harmless on Windows but worth an upstream fix.
- **The buck example has no hardware-free seam.** Its control law sits in `loop_critical_task` and calls `shield.sensors` and `shield.power` directly, and its user interface is a serial console menu, not ThingSet. Core2's `controlStep` seam (its ADR 0001) was added by hand for one application. The OwnTech examples repository holds 57 example folders. Taken up in round 6.
- ThingSet over serial exists in Core4 on branch `serial_thingset_example_modular`.

Twist facts gathered from `~/Documents/HARDWARE/TWIST` (v1.4.3, last commit 2025-11-28):

- Bidirectional, 300 W, 200 kHz with interleaving. Two low-side channels (12 to 72 V, 8 A each, 16 A in parallel) and one high side. The documentation gives the high-side range inconsistently: "10 V to 100 V", "10 V to 110 V" and "12 V to 100 V" all appear.
- Per power leg (`PowerLeg.kicad_sch`): a 33 µH inductor and 33 µF capacitors, plus a 47 µF capacitor. The schematic sheet for the auxiliary supply is named `Feeder.kicad_sch`.
- Sensors: low-side and high-side currents through isolated Hall-effect sensors (±20 A), and high-side voltage through a divider plus an isolation amplifier. The measurement bridge block is therefore isolated on the Twist.
- Operating modes come from the getting-started guide: buck (HIGH in, LOW out), independent, boost (LOW in, HIGH out), single-phase buck inverter, buck PFC. Each mode also says whether the electrolytic capacitor is fitted.
- The buck voltage-mode example asks for a 20 to 60 V DC supply.
- OwnModels holds PLECS and Simscape models. No Pulsim model of the Twist was found; Core2's `full_model.pulsim` is the uSolarVerter.

## Round 6 (2026-11-07)

Luiz's framing: the ThingSet serial example in Core4 is the basis of the work. It is assumed to cover buck and boost already, and will be extended to inverter operation.

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q37 | Layers named Specification · Build · Verification? | Yes ("evidence" is a false friend in French). | Yes. | glossary |
| Q38 | Virtual Twist (host version of the API)? | Yes. | Objects: it would not test the real API, and the Theia app would have to maintain a copy of the API. Counter-proposal: extra elements in the API itself, also compiled, that let measurements come from the simulation. **Adopted.** | [ADR 0016](adr/0016-simulation-backend-inside-the-core-api.md), glossary |
| Q39 | Board rating vs mission envelope? | Yes. | Yes. | glossary |
| Q40 | Board description in the hardware repo? | Yes. | Yes. Where does that repo live, is it shipped, can it be added via git to import any board with a standard description, and can the API's `.dts` be used? | [ADR 0017](adr/0017-board-descriptions-in-hardware-repos.md) |
| Q41 | Check the Twist plant model against the bench first? | Yes. | Yes; write a test procedure for the model, as done for the model tests in Core2. | this log |
| Q42 | Mission files next to each example? | Yes. | Prefers one generic firmware based on the ThingSet serial example, giving maximum flexibility on the Twist. Missions would put that firmware into a given state. This avoids many examples with different communication tasks and single-character serial commands. **Follow-up in round 7.** | — |
| Q43 | Merge Core4's branch into Core main or pin it? | Merge if within reach. | Asked whether Core4 changes the core or only adds an app on top, since Core holds an empty `main` and project specifics could live in `app.conf`. | finding below |
| Q44 | Start from the Theia IDE template at the current Theia release? | Yes. | Yes. | this log |
| Q45 | Installer bundles PlatformIO packages for offline first build? | Yes. | Yes. | this log |

Findings for round 6:

- **Core4 (`serial_thingset_example_modular`) is an app on top of Core, with three leaks.** It is based on OwnTech `main` at `294dfb2` (2026-07-30), carries 38 commits, and is one commit behind OwnTech `main`. Nearly all changes are in `src/`: `app.conf` (enables ThingSet, shell and serial; switches off logging), `app.overlay`, `main.cpp`, `thingset_callbacks.cpp`, `user_data_objects.*`, the scope capture, and Python/MATLAB tools with tests. Three changes reach Core itself:
  - `zephyr/CMakeLists.txt`: changes the shield to `twist_v1_4_2` and lists the app's extra sources;
  - `platformio.ini`;
  - `owntech/scripts/pre_bootloader_serial.py`: picks the right interface on composite USB devices and refuses to fall back to another board. This is a genuine Core fix and deserves its own upstream PR.
- **The Core4 firmware is a configurable tester.** Each power leg has `buck`/`boost` flags, duty cycle, reference, a tracked variable, capacitor and driver switches, phase shift, rising and falling dead time, and `v_max`. There are six calibration channels with gain and offset, plus board metadata (version, serial number). Its modes are `IDLE`, `POWER_ON` and `POWER_OFF`. Inverter operation is not there yet.
- **The Twist devicetree** (`sensors.dtsi`, `twist_v1_4_2.overlay`) already describes every sensor, its ADC channels and its default gain and offset. It does not hold ratings, component values, modes or isolation.
- **Zephyr dependencies of the API upper layers:** the shield API (about 3.3k lines) uses `kernel.h`, the console, and many devicetree macros. The task API uses `kernel.h` (threads, sleep, yield, work queues). The spin API (about 6.7k lines) also uses DMA, GPIO, UART, CDC-ACM, MCUboot and reboot.

## Round 7 (2026-11-07)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q38 follow-up | (Luiz) Does the simulator need all the simulation-backend plumbing? Core2 does without it. | — | Answered in round 8: Core2 avoids it because its control logic sits in a hardware-free function. Since missions carry their own `main.cpp`, they can be written that way. | [ADR 0018](adr/0018-skeleton-simulates-a-hardware-free-control-function.md); ADR 0016 deferred |
| Q46 | Generic chassis firmware with a control-law slot? | Yes. | Misunderstanding. The intent is that ThingSet replaces the communication task as a standard way to exchange data with the board (partly the interface with the environment, here the computer), while the code stays mostly the examples' code. Data objects shown as a table that can be amended and that generates more data objects. | [ADR 0019](adr/0019-thingset-replaces-the-communication-task.md), glossary (Data object, Data object table) |
| Q47 | Where does the firmware live? | Examples repo. | (b) examples repo; for the mock-up, Luiz's fork of the examples. | this log |
| Q48 | Mission = one file describing a firmware state? | Yes. | The mission holds all that **plus its `main.cpp`**, so students have firmware to iterate on. This also helps pull the existing examples into the app later. | glossary (Mission) |
| Q49 | Buck only in the skeleton? | Buck, boost stretch, inverter later. | Buck only for now. | this log |
| Q50 | Four-week plan with a fallback rule? | Yes. | Call them four **steps**, not weeks. If step 1 stalls that is fine; the month is not a tight deadline. | [plan](plan.md) |
| Q51 | Who builds it? | Luiz + AI, one PhD student on the plant model, ask Jean about panels. | Luiz builds it all, and asks the others to test it. | this log |
| Q52 | Study measures: step completion and time, SUS, three open questions on Design, think-aloud observer? | Yes. | Yes. | [plan](plan.md) |
| Q53 | Interface language? | English UI, missions in French and English. | English only; students will adapt. | this log |

## Round 8 (2026-11-07)

Answer to Luiz's Q38 follow-up: Core2 needs no plumbing because its control logic is in `controlStep()`, which calls no `shield.*` functions. Only that function is compiled into Pulsim. The buck example calls `shield.sensors` and `shield.power` inside `loop_critical_task`, so running it unmodified would need the API on the host. Missions carry their own `main.cpp` (Q48), so they are written Core2-style and the plumbing is deferred (ADR 0018).

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q54 | Core2 testing vocabulary and tooling, plus L2 for the bench? | Yes. | Yes. | [ADR 0020](adr/0020-core2-testing-vocabulary-with-l2.md), glossary |
| Q55 | Each requirement has at least one test case, and the link is checked? | Yes. | Yes. | [ADR 0020](adr/0020-core2-testing-vocabulary-with-l2.md) |
| Q56 | Firmware scope only for bench waveforms in the skeleton? | Yes. | Yes. | [ADR 0020](adr/0020-core2-testing-vocabulary-with-l2.md), glossary |
| Q57 | Design: analytic Python models visible to students, with a Pulsim AC cross-check? | Yes. | Yes. | this log |
| Q58 | `data_objects.yaml` as source, C generated? | (a). | (a), so a table can be built from the YAML for easier visualisation. | [ADR 0021](adr/0021-data-objects-yaml-generates-c.md) |
| Q59 | AI provider and who pays? | University key with a cap; AI optional. | Suggests a local AI when a student has no API key, rather than sharing his own key. **Follow-up in round 9.** | — |
| Q60 | Licence and name? | LGPL-2.1, OwnStudio. | LGPL-2.1, OwnStudio. | [ADR 0022](adr/0022-name-and-licence.md) |

## Round 9 (2026-11-07)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q61 | Where does the AI run without a key? | Lab GPU server, then own key, then local. | Look up whether the University of Toulouse provides an AI to students; that is option 1, then own key, then local. | [ADR 0023](adr/0023-ai-endpoint-order.md) |
| Q62 | Mission folder layout? | As proposed, with `control_step.cpp`. | No need for `control_step.cpp`; `main.cpp` can hold the firmware. What is needed is `app.ini`, `app.conf`, `app.overlay` for some examples later. **Pushed back in round 10.** | — |
| Q63 | Converter projects as git repos with automatic checkpoints per mission step? | Yes. | Yes. | this log |
| Q64 | Bottom workbench bar Home · Design · Code · Lab, Ctrl+1…4, per-workbench layout, target and board status? | Yes. | Yes. | this log |
| Q65 | Reuse modular's dashboard format and widgets? | Yes. | Yes, but asked whether it would import easily, given modular is built on Freeboard and Node.js. **Answer: no, not as is.** | [ADR 0024](adr/0024-panels-rebuilt-natively-modular-format-subset.md) |
| Q66 | App updates by new installer; missions and board packs by git? | Yes. | Yes, keep it simple for now. | this log |

## Round 10 (2026-11-07)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q67 | Keep a separate hardware-free `control.cpp` (needed to compile the control law on the PC for Pulsim), plus `app.ini`, `app.conf`, `app.overlay`? | Yes. | Yes. | [SPEC](../SPEC.md#9-missions-and-the-landing-page) |
| Q68 | Is LAAS ZRR? Does a university AI service offer an API? | Luiz checks both. | LAAS is ZRR, which is not a problem at this stage. Assume no university API for now. Luiz also wants to connect Claude. | [ADR 0023](adr/0023-ai-endpoint-order.md) |
| Q69 | Wrap up into one SPEC.md and a shareable page? | Yes. | Yes. | [SPEC](../SPEC.md) |

The design tree is fully visited. Open items are listed in [SPEC §15](../SPEC.md#15-open-items).

---

# Step 5 grilling, after Luiz's trial of 2026-11-10

Luiz tried OwnStudio end to end ([his notes](design/trial-2026-11-10-notes.md)) and found it cumbersome. These rounds turned his notes into a new direction. Recorded in [ADRs 0025–0032](adr/), the [glossary](../GLOSSARY.md) and [SPEC 2.0](../SPEC.md). Design references: [canvas styles](design/canvas-styles.html), [test sequence editor](design/test-sequence-blockly.html), [storyboards](design/storyboards.html).

## Round 11 (2026-11-10): the roast of the trial

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q70 | The objective? | A student completes the five mission steps in 65 min without help. | No: a colleague or PhD student builds a setup on a Twist (drag source, Twist, load; set up the inside; load an example; build and flash; a simple capture; simulate with the same parameters, overlaid; change design or code; rerun), all in one tool. | SPEC §2 |
| Q71 | One canvas, two zoom levels, always visible at the bottom? | Yes. | Yes; propose better-looking designs. | [ADR 0026](adr/0026-setup-canvas.md) |
| Q72 | Parts pre-placed by the mission? | Pre-placed, palette later. | Palette now; the setup starts empty; the simplest case refuses source–Twist–source and load–Twist–load. | ADR 0026 |
| Q73 | A block click opens an inspector? | Yes. | Yes, with Design, Code and Tests as buttons. | ADR 0026 |
| Q74 | Workbenches on the left icon bar; green title bar? | Yes. | Yes. | SPEC §5 |
| Q75 | Design as a live form, Python computing? | Yes. | Yes. He never saw the Bode plot (step 2 opened `sizing.py`). | SPEC §7 |
| Q76 | Code shows the student files only, with language support? | Yes. | Yes, `main.cpp` included: its setup may need tweaking. | SPEC §8 |
| Q77 | Interactive plots zoomed on the event; real progress? | Yes. | Yes. | SPEC §9 |
| Q78 | Refuse a dead HIGH and the wrong board? | Yes. | Yes; the profile partly from the bottom pane, details in the Lab. | SPEC §9 |

## Round 12 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q79 | Example as base, mission on top? | Yes. | The **board** is the base: it opens examples, the design sheet and lab procedures. A mission is a guided tutorial. | [ADR 0025](adr/0025-the-board-is-the-root.md) |
| Q80 | Canvas or example owns the hardware? | Canvas wins. | The board owns everything; the canvas matches things together and chooses what to observe. Its background follows the tab. | ADR 0025, 0026 |
| Q81 | Inside-the-Twist settings: generated `setup.cpp`? | Generated, with "take over". | The canvas is the source of truth but code edits must flow back. | [ADR 0027](adr/0027-setup-round-trip.md) |
| Q82 | Topology rules for the first version? | One source on HIGH, one Twist, one load on LOW1. | Yes, simple first. | ADR 0026 |
| Q83 | A form that writes a procedure? | Yes. | Like today: scope captures retrieved into a data folder (as Core2), rendered nicely. | SPEC §9 |
| Q84 | Read-only generated schematic? | Yes. | Use PulsimGui (AppImage on this machine): can it be added? | Q88, Q109 |
| Q85 | What is simulated? | ADR 0018 plus setup. | Tell the user what the harness feeds and what Pulsim models; import setup details where possible. | SPEC §10 |
| Q86 | Profile from the canvas, 10 % check? | Yes. | Yes: the Lab checks automatically before Run goes green. | SPEC §9 |
| — | (Luiz) The AI companion | — | Like VS Code: link a ChatGPT or Claude account; OwnTech and power-electronics skills. | Q94 |

## Round 13 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q87 | "Board pack", "Mission"? | Board pack, Example, Setup, Mission. | Not "pack" (see what others use), "Tutorial" instead of "Mission". Example and Setup kept. | Q96, glossary |
| Q88 | Same canvas, tab-dependent; probes in the Lab? | Yes. | Yes. Code on the source and load may come (instrument scripts). The Lab also has a test sequence; no-code, generating Python. | ADR 0029 |
| Q89 | Round-trip on recognised calls? | Yes. | Yes: back and forth on save, recognised calls inside the setup routine only. | ADR 0027 |
| Q90 | Scope capture as default? | Yes. | Yes, through ThingSet. Slow code (state machines) needs widgets and slow plots like modular; fast code needs the scope. | Q99 |
| Q91 | PulsimGui: what to do? | Adopt `.pulsim`, draw it, button later. | Too much work to re-create PulsimGui; a button, and room for PLECS or MATLAB later. | Q100, Q107 |
| Q92 | A simulation sheet? | Yes. | Yes, but good-looking, not an endless table; as the competition does. | Q101 |
| Q93 | Run green only after checks? | Yes. | Yes, and it keeps checking: back to red if something goes off. | SPEC §9 |
| Q94 | Claude Code and Codex integrations, skills in the board? | Yes. | Yes, and consider shipping a light AI specialised in power electronics. | Q103, Q110 |
| Q95 | Power only through OwnStudio's dialog? | (b) token. | (b), with an "AI takeover" button that appears only when enabled. | [ADR 0031](adr/0031-ai-agents-and-takeover.md) |

## Round 14 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q96 | Board, Example, Setup, Tutorial? | Yes. | Yes. | glossary |
| Q97 | Sequences of steps, no-code, Python underneath? | Yes. | Yes; find an editor; drag variables into boxes; call it a test flowchart. A procedure is more than the flowchart (setup, data). | Q105 |
| Q98 | Instrument driver hook? | Yes. | Hook now, real drivers later from existing projects. | SPEC §9 |
| Q99 | Monitor and Capture probe modes? | Yes. | Yes, and the user must see which mode they are in (colour). | Q106 |
| Q100 | "Open in PulsimGui" over an external-simulator interface? | Yes. | Yes. Core2 runs Pulsim and opens the GUI: doesn't it simulate there? Could Simulate happen in PulsimGui, with "save changes" exported to the model? | Q107 |
| Q101 | Fidelity chips on the canvas? | Yes. | The user will want to edit and see the model: how? | Q107 |
| Q102 | Canvas style C (nodes) with D's palette? | Yes. | Yes, but how does the user export a wiring diagram? The Twist docs have them. | Q109 |
| Q103 | Offline AI in three stages? | Yes. | Yes, ambitious even without training. | Q110 |
| Q104 | Takeover limits? | One sequence, 30 min, revoked on red, change or Stop. | Yes. | ADR 0031 |

## Round 15 (2026-11-10)

Facts found: Core2's plant is a `.pulsim` file with the firmware as a C-Block; its runner loads it without Qt; `open_gui.sh` runs PulsimGui with a Core backend calling the same runner. The Twist docs hold draw.io wiring and circuit diagrams per topology.

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q105 | Procedure contains a test flowchart; UML subset; React Flow? | Yes. | Agreed, but Blockly to customise: can it nest? | Q111 |
| Q106 | Monitor blue, Capture amber? | Yes. | Yes. | SPEC §9 |
| Q107 | Adopt Core2's simulation pattern (replaces A11)? | Yes. | Yes. | [ADR 0028](adr/0028-simulation-follows-core2.md) |
| Q108 | PulsimGui through pip? | Yes. | Yes. | ADR 0028 |
| Q109 | Wiring diagrams from draw.io templates? | Yes. | How would auto-generation work: a template library with connection points, in a GitHub repo? Answer: no routing; placeholders and layers only. | SPEC §11 |
| Q110 | AI: integrations, takeover, three skills; local model a research track? | Yes. | Yes; Core is the API's source of truth, as in VS Code today. | ADR 0031 |

## Round 16 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q111 | Blockly or React Flow? | Blockly, flat theme. | Blockly; render it ([mock-up](design/test-sequence-blockly.html)). | [ADR 0029](adr/0029-test-sequences-in-blockly.md) |
| Q112 | Slice 0: fix the trial's bugs first? | Yes. | No: the new version is totally different. Progress bars, language support, interactive plots and the checklist go into the new work. | plan |
| Q113 | Slices 1–4? | Yes. | Yes, but first artwork showing where everything goes: that is slice 0. | plan |
| Q114 | PhD trial after slice 1? | Yes. | Only once Luiz has used it end to end and finds it "good enough", not perfect. | plan |
| Q115 | Board definition in the OwnStudio repo? | Yes. | Boards first; examples pulled from the examples library; examples depend on other libraries; rethink the examples-library workaround. | Q118–Q121 |
| Q116 | Paper before code? | Yes. | Yes: thoroughly documented, commit sequences, storyboards and pages kept locally as HTML or PDF. | plan |

## Round 17 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q117 | Layout and Start? | As drawn. | Add a timeline at the bottom like Fusion 360, git-based with branches and resets. Start replaces Home; look at Arduino's board choice. | [ADR 0030](adr/0030-setups-are-git-repos.md), SPEC §5 |
| Q118 | Read the examples index, filtered by board? | Yes. | Yes (it means updating the repo). | Q128 |
| Q119 | Load example into a new setup? | Yes. | OwnTech libraries loaded natively, with a checkbox menu; loading an example like Arduino; the previous one filed away as today. | Q125, Q126 |
| Q120 | `lib_deps` plus a lock file? | Yes. | OwnStudio must be git-native: commit, pull from other cores, edit libraries locally, PRs, local libraries. | Q127, ADR 0030 |
| Q121 | OwnStudio extras in `ownstudio/` in examples? | Yes. | Examples are quick starts; changes are kept in an OwnStudio folder; unsure of the implications. | Q129 |

## Round 18 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| — | (Luiz) The top menus | — | Must be set now; forgetting them cost a lot in modular. | Q130 |
| Q122 | The timeline: auto-commits, icons, restore, branches? | Yes, lanes later. | Yes; branches later but supported. | ADR 0030 |
| Q123 | Records out of git? | Yes. | Yes: reproduce, don't share heavy results; share light reports. | ADR 0030 |
| Q124 | Start and board choice, Arduino-style? | Yes. | Yes, ready for custom boards; look at the devicetree in Core's zephyr folder, including Spin pins on shields, maybe an oscilloscope on a Spin pin. | Q131, Q132 |
| Q125 | An example loads as a branch? | Yes. | Yes. | ADR 0030 |
| Q126 | Library list in a left panel? | Yes. | Yes, but in a menu: it is rare. | SPEC §12 |
| Q127 | Libraries as submodules, proposable upstream? | Yes. | Yes, and forks: many remotes and cherry-picks. | Q133 |
| Q128 | Infer the board now, PR the field later? | Yes. | Yes. | ADR 0025 |
| Q129 | Where things live? | `~/OwnStudio/` setups, board defaults, plain examples. | How does this fit the git workflow? | Q134 |

## Round 19 (2026-11-10)

Facts found: `spin_header.dtsi` maps the Spin header to MCU pins; `twist_v1_4_2.overlay` describes legs, PWM pins, defaults and sensors with gains, offsets and Spin pins.

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q130 | Eight menus, expert mode for Theia's? | Yes. | Yes, without Theia's at all, but with a terminal. | [SPEC §5](../SPEC.md#5-the-window) |
| Q131 | Board = devicetree overlay + small OwnStudio file? | Yes. | Yes. | [ADR 0032](adr/0032-boards-from-the-devicetree.md) |
| Q132 | Pin map and oscilloscope node in the model now? | Yes. | Yes. | ADR 0032 |
| Q133 | Forks, many remotes, import local clones? | Yes. | Yes. | ADR 0030 |
| Q134 | The setup as git repo, example copied, reports committed? | Yes. | Yes; how does it avoid merge deadlocks? | Q137 |
| Q135 | Push guard? | Yes. | Propose the user's own fork, and make keys easy (generate, open the GitHub keys page). | Q138 |

## Round 20 (2026-11-10)

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q136 | Terminal as a bottom tab? | Yes. | Yes, with a button at the bottom. | SPEC §5 |
| Q137 | Four merge rules? | Yes. | Yes. | ADR 0030 |
| Q138 | Sign-in? | Browser sign-in; SSH generated and uploaded by API; existing keys used. | Yes. | ADR 0030 |

Luiz confirmed the shared understanding and asked for slice 0 (2026-11-10).

## Round 21 (2026-11-10): review of slice 0

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q139 | A setup is a clone of OwnTech Core? | Yes. | Yes. | SPEC §12, ADR 0030 |
| Q140 | The inside view and a read-only inspector in slice 1? | Yes. | Yes. | SPEC §6, plan |
| Q141 | Choices S1–S10 of the slice 1 plan? | As written. | All accepted. S7 (restore makes a branch) must be tested for performance with many back-and-forths: a branch now appears only at the first edit after a restore, and 200 restores must each take under 2 s. | plan |
| — | (Luiz) Storyboards | — | Icons instead of letters on both icon bars; panel 4's blocks not drawn as he likes (redrawn on his reference layout); panel 6 lacks Build and Upload buttons and PlatformIO's terminal (added: Code toolbar, status bar buttons, Build output tab). | storyboards v2, SPEC §5, §6, §8 |
| — | (Luiz) The plan has tests but no comparison with the storyboards | — | Each window commit names its frames and is checked against screenshots taken by `tools/storyboard-shots`; the slice report shows them side by side. | plan |
| Q142 | Parts works the same from every workbench, without switching? | Yes. | Yes; test it and all clicking back and forth, with a specific test. | SPEC §5, plan (navigation test), storyboard 6b |
| Q143 | (Luiz) The inside of the Twist | — | Too heavy: blocks show their names only, the inspector shows the details on click; keep the labels (sides, signals, isolation, ports). | SPEC §6, storyboard 4 |
| Q144 | Requirement layers: badges on the inside view and a list in the inspector? | Yes. | Yes. | SPEC §6 |
| Q145 | (Luiz) An averaged-model simulator, as in Core2, later | — | Recorded as a deferred third target for fast evaluation, following Core2's ADR 0004: never a verdict, only at the user's request, level D, INFO. | [ADR 0033](adr/0033-averaged-simulator-for-fast-evaluation.md) |

## Round 22 (2026-11-13): timing on the Spin

Luiz asked whether Core2's on-target timing work could become an OwnStudio feature, with a storyboard.

Facts found:
- Core2 ADR 0005: DWT probes compiled only in a `TIMING` PlatformIO env, results in RAM read over SWD with an ST-Link, an 80 µs budget, baseline +10 % + 50 cycles. TIM-03 runs the real firmware and reads the USB console.
- The control center's rules: one hue per group; bars add up to the measured total, with the unprobed rest in grey; worst mark; budget and period lines; overview and detailed view; always a table.
- OwnStudio flashes over USB only (MCUboot and mcumgr).
- The buck example already speaks ThingSet (ADR 0019).
- `ownstudio_lab/thingset.py` exists.
- The workbench tints are Design `#1f2a3a`, Code `#1f2427`, Lab `#2a2419`.
- The timeline uses violet for design events and green for runs.

| # | Question | Recommendation | Answer | Recorded in |
|---|---|---|---|---|
| Q146 | For whom? | Both students and developers, the student's view first. | Yes: a default first, the details come naturally. | ADR 0034 |
| Q147 | USB only at first, ST-Link later? | Yes. | Yes; ST-Link will be needed by developers in the long run. | ADR 0034, ADR 0035 |
| Q148 | A live load gauge and a Timing check on request? | Yes. | Yes; a light return shown as a coloured gauge. Over ThingSet? | Q154 |
| Q149 | Automatic groups, user-named sections, or both? | Both. | Both. | ADR 0034 |
| Q150 | Budget 80 % of the setup's control period, editable? | Yes. | Yes. | ADR 0034 |
| Q151 | Probes in the Spin API through Luiz's fork? | Yes, then upstream. | Fork for now: try it, see how the integration renders, then upstream. | ADR 0034 |
| Q152 | May agents run a Timing check? | Yes. | Yes; the agent needs a procedure for testing and reporting, as in Core2, or the data is hard to interpret. | ADR 0034 (AGENTS.md recipe) |
| Q153 | Which slice? | Slice 3, next to Monitor. | Slice 3. | plan |
| Q154 | Load as built-in ThingSet objects, worst case, green/amber/red? | Yes. | Yes. | ADR 0034 |
| Q155 | Timing report over ThingSet? | Yes. | Yes. | ADR 0034 |
| Q156 | The user's firmware unchanged, outputs inhibited, states walked by ThingSet writes; trace replay deferred? | Yes. | Yes. | ADR 0034 |
| Q157 | A Timing check procedure with criteria and a record, and an agent recipe? | Yes. | Yes. | ADR 0034 |
| Q158 | Write the ST-Link ADR now, build later? | Yes. | Yes, write it now. | ADR 0035 |
| Q159 | Status-bar gauge, inside-view badge, toolbar button, Timing tab, CodeLens? | All five. | Yes to all, shown properly in a storyboard. | storyboard T-1…T-9 |
| Q160 | Core2's hues without amber and blue? | Yes. | Yes; does it render well with the workbench colours? The validator rejected slate; the order aqua, violet, magenta, green passes on all three tints. | Q161 |
| Q161 | Aqua, violet, magenta for the user's code, green, grey; accept the overlap with the timeline's violet and green? | Yes. | Yes; document the choice. | ADR 0034 (Colours) |
| Q162 | Timing dots and before/after pairing? | Yes. | Yes. | ADR 0034 |
| Q163 | Firmware match "TIMING image", checklist block, "put it back"? | Yes. | Yes; a user easily forgets to flash the right code. | ADR 0034 |
| Q164 | Grey gauge for firmware without the load objects? | Grey, with a tooltip. | Isn't this slice 3 anyway? Answer: partly. The buck example already speaks ThingSet and gets the gauge as soon as the fork publishes the objects; most other examples don't. | ADR 0034 |
| Q165 | Nine storyboard frames? | Yes. | Yes, for now. | storyboard |
| Q166 | Convert only the tutorials' Twist examples to ThingSet? | Yes. | Yes. ThingSet proved hard to use when converting the examples (`thingset_examples` branch); a generic example, and a few like it, is a direction, but not all 38. | plan, ADR 0034 |
| Q167 | Core2's review page structure for the record? | Yes. | The pages were too verbose: the figure is what matters. Figure first; tables and text in collapsible sections. | ADR 0034 |
| Q168 | Units T1–T8 after Monitor in slice 3? | Yes. | Yes. | plan |
| Q169 | Bench acceptance (under 2 min, 0.1 µs, bars add up, gauge within 5 %, firmware back)? | Yes. | Yes. | plan, ADR 0034 |
| Q170 | A paper commit on its own branch; storyboard drafted? | Yes. | Yes; the storyboard stays local. | this commit |

Luiz confirmed the shared understanding on 2026-11-13.

Amendment (2026-11-13): Luiz moved the timing work after slice 4, as slice 5 (it was slice 3 in Q153 and Q168). The ST-Link developer slice (ADR 0035) moves after slice 5. Plan, SPEC §8 and §19, ADRs 0034 and 0035 updated.
