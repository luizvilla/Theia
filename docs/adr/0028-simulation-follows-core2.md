# Simulation follows Core2: one .pulsim plant with the control code as a C-Block, one runner, PulsimGui as editor

The plant model is a `.pulsim` file shipped with the board (for the Twist, the buck on leg 1) and copied into the setup. The student's control code is compiled into a native Pulsim C-Block placed in that circuit, exactly as Core2's L1 tests do with `controlStep`. One runner loads the file (through PulsimGui's project model, which needs no Qt), applies the setup's values to named components, runs the procedure and files the record. "Open in PulsimGui" launches PulsimGui (installed with pip in OwnStudio's Python environment) with an OwnStudio backend, so its Run button calls the same runner. Saving in PulsimGui writes the setup's `.pulsim`; OwnStudio watches it and syncs the values of named components (Vin, Rload, L, C) back to the canvas, under the round-trip rule of ADR 0027; a structural change shows as "custom circuit".

This replaces choice A11 of [architecture.md](../architecture.md) (a plant built in Python and a per-mission harness), which departed from Core2 and from ADR 0018's intent without need.

## Considered options

- **Keep the Python-built plant and harness (A11)**: no circuit view, no editor, one more pattern to maintain.
- **Re-create a schematic editor in OwnStudio**: years of work, already done by PulsimGui.
- **Core2's pattern**: chosen; already proven on the microinverter, one file and one runner behind two windows.

## Consequences

- PulsimGui (MIT, PySide6, about 200 MB) is installed with pip, not as an AppImage, which needs a patch to start on Ubuntu 24.04 and does not exist on Windows.
- The exact-PWM-edges fix (finding #12) was written for the `switch_fn` path and must be checked again on the C-Block path.
- An external-simulator interface leaves room for PLECS or MATLAB later; their results would not feed the overlay unless they run the same procedure.
- The simulation sheet (what the control receives, what is modelled, what is not) is generated from the plant file and the setup, shown as fidelity chips on the canvas.
- ADR 0018 stands (a hardware-free control function), now reached through the C-Block.
