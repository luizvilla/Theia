---
status: superseded by ADR 0025 (the board is the root; setups)
---

# The three workbenches share one converter project stored as plain files

Design, Code and Lab all read and write a single converter project instead of being three tools that exchange files. The project is plain files under git (YAML, Pulsim models, C++, Python) so it stays usable, diffable and reviewable without the application. This was chosen over the loosely coupled launcher model (Typhoon HIL Control Center, TI powerSUITE exchanging CSV files) because it lets the comparison of requirement, simulation and measurement be a first-class view rather than a manual post-processing step. The cost is a project schema that has to be designed up front and migrated when it changes.

## Consequences

- Every converter project is described with five converter blocks: power, measurement, control, driver and auxiliary power supply (see the glossary for their boundaries, and [the reference drawing](../images/five-blocks-reference.png)).
