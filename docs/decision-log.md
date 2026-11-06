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
| Q32 | Panels and procedures, no logic in panels? | Yes. | Yes: procedures are like scripts; panels monitor incoming data and trigger outgoing signals. | [ADR 0014](adr/0014-lab-panels-and-procedures-over-one-variable-dictionary.md), glossary |
| Q33 | ThingSet as the single variable dictionary, simulator speaks it too? | Yes. | Yes; makes it easy to amend data for a given development. | [ADR 0014](adr/0014-lab-panels-and-procedures-over-one-variable-dictionary.md), glossary |
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
