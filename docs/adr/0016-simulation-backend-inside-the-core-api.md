---
status: proposed, deferred until after the skeleton (see ADR 0018)
---

# The simulator target uses a simulation backend inside the Core API, not a copy of the API

To run unmodified application code on the simulator target, the OwnTech Core API gains a simulation backend at its lowest layer: alternative implementations of the hardware drivers (ADC, HRTIM, timers, comparator, DAC, flash) that exchange measurements and PWM commands with the plant model, plus a small host shim for the Zephyr kernel calls the upper layers use. Everything above the drivers (shield, spin, task and safety APIs, calibration) is the real code. The backend lives in the Core repository next to the real drivers and is maintained by the Core team, not by the Theia application.

## Considered options

- **A host copy of the API in the Theia application**: rejected. It would test the copy rather than the API and doubles maintenance (Luiz's objection).
- **Zephyr `native_sim`**: the most faithful, but runs on Linux only, which conflicts with Windows first (ADR 0011). Kept as a developer option on Linux.
- **Emulating the STM32G4 (Renode, QEMU)**: rejected. No emulator models the HRTIM.
- **A hand-written hardware-free seam per application (Core2's `controlStep`)**: kept for advanced projects, but not required for missions.

## Consequences

- The upper layers depend mainly on devicetree macros (`DT_*`, `DEVICE_DT_GET`) and a few kernel calls (`k_malloc`, `k_sleep`, threads, work queues). Devicetree headers can be generated from the board's `.dts` by Zephyr's Python scripts on any OS. Feasibility on Windows is the first spike of the skeleton.
- Simulation now covers ADC scaling, calibration and PWM configuration, which Core2's `controlStep` seam leaves out.
