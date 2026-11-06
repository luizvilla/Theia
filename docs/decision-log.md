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
