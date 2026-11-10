# Test sequences are drawn in Blockly and generate Python

A procedure's **test sequence** is built in a Blockly editor in the Lab, with a flat OwnStudio theme ([mock-up](../design/test-sequence-blockly.html)). Blocks read as sentences with slots; variables (the board's data objects, the source and load parameters, the probes on the canvas) are dragged into the slots. C-shaped blocks nest (repeat, if/else, "while the converter is on"), groups of blocks become named user blocks used as one line, and any container collapses to one line with a count. The editor generates the procedure's Python, which stays readable and runnable from the command line; hand edits become "custom step" blocks (ADR 0027). Block colours follow the probe modes: amber for Capture, blue for Monitor, orange for power, which is always confirmed.

This supersedes ADR 0004 (no visual programming in v1) for the Lab. ADR 0004's concerns are met: the sequence is saved as Python, so it diffs in git and agents can write it; Blockly's workspace file is kept beside it only to restore the layout.

## Considered options

- **Python only** (ADR 0004): the trial showed colleagues will not write procedures from scratch.
- **A UML-style flowchart in React Flow**: the look Luiz first asked for, but arrows may jump anywhere, which makes the Python generation and the round-trip much harder.
- **Blockly**: chosen; structured only, nests, collapses, generates Python natively, Apache-2.0.

## Consequences

- A procedure is the setup check, the test sequence, and the data handling afterwards (collecting captures and monitor logs into a record, the overlay with simulation, a light report).
- The Blockly block set is versioned with OwnStudio; boards may add blocks.
