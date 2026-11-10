# Canvas and code round-trip on save, through recognised calls in one setup function

The board's settings made on the canvas (legs, mode, switching frequency, dead time, control period, calibration) are written into one marked setup function in `main.cpp`, and changes the user makes to that function flow back to the canvas. Synchronisation happens on save. Only a known list of OwnTech SDK calls inside that function is recognised; a canvas edit rewrites only the recognised call it concerns, and anything else in the function is shown on the canvas as "custom code" and never touched.

The same rule governs the test sequence editor (ADR 0029): it reads back its own generated calls, and hand-written Python appears as a "custom step".

## Considered options

- **Generated setup file with a "take over" switch**: robust, but the canvas goes dead as soon as the student edits code, which Luiz rejected.
- **Free parsing of `main.cpp`**: fragile; arbitrary C++ (computed values, conditions, macros) cannot be rewritten safely.
- **Recognised calls in one function, on save**: chosen; both directions work, and the boundary is visible.

## Consequences

- The recognised call list is versioned with the board definition and grows with the SDK.
- Recognised setup values also feed the simulation (ADR 0028), so the simulator sees the frequency, dead time and control period the board will use.
