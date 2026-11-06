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
