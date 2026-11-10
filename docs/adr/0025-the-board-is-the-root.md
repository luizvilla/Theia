# The board is the root; work happens in setups; missions become tutorials

OwnStudio starts from a **board**, not from a mission or a converter project. Choosing a board (Start page, as Arduino IDE 2's board selector) opens what belongs to it: its examples, its design sheet, its lab procedures and its plant model. The user's work lives in a **setup**: one folder holding the canvas (source, board, load), the board's settings, the firmware loaded from an example, procedures, records and reports. A **tutorial** (formerly a mission) is an optional guided walk over a setup, not the centre of the app.

This replaces the converter project of ADR 0002 as the shared object. The workbenches still all work on one shared object kept as plain files under git; what changed is the entry point and the name. The mission-first design was tried on 2026-11-10 and found cumbersome: it hid the tools behind steps and made a colleague who just wants an experiment follow a lesson.

## Considered options

- **Mission first** (SPEC 1.0): rejected after the trial.
- **Example first** (a mission is an example with requirements): rejected; examples depend on a board, so the board comes first.
- **Board first**: chosen. It matches how OwnTech users already work (a Twist on the bench, pick an example) and how Arduino users pick a board.

## Consequences

- Examples are read from the existing examples repository's index, filtered by board. The board is inferred from the entry's group name and `app.ini` until a `board` field is added upstream through Luiz's fork.
- Requirements, test cases and the Verification layer survive as layers a setup may carry (the buck example's), not as a precondition.
- Supersedes ADR 0002 (the converter project) and the mission parts of SPEC 1.0 §9. ADR 0012's date for a student test is replaced: the PhD trial comes once Luiz has used OwnStudio end to end and finds it good enough.
