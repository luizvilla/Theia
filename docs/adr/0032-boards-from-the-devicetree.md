# A board is its devicetree overlay plus a small board description, so custom boards are possible

A board definition has two parts. The **devicetree overlay** in Core (for the Twist, `zephyr/boards/shields/twist/twist_v1_4_2.overlay`, with the Spin's `spin_header.dtsi`) is the source of truth for the hardware: legs and their PWM, driver and current pins, default frequency and dead time, sensors with their ADC channels, Spin pins, gains and offsets, and thresholds. OwnStudio reads it with Zephyr's Python devicetree library. A small **board description** (ADR 0017) holds what the devicetree does not: the drawing, the power ports and their ratings, the `.pulsim` plant, the wiring templates, the recognised setup calls (ADR 0027), the default capture procedure and the skills (ADR 0031). A custom board is "your overlay plus a board description", and OwnStudio draws its inside view from it.

The Spin header map makes pins addressable by name ("LEG1 PWM high, pin 12"), so an instrument node on the canvas (an oscilloscope) can have probes attached to a Spin pin or a power node, and the wiring diagram can show where to clip them. This is in the data model now and in the interface after slice 1.

## Considered options

- **A board description repeating the devicetree's facts**: two places for one fact.
- **Devicetree plus a small file**: chosen; it refines ADR 0017, whose split by owner it keeps.

## Consequences

- The board description of the Twist starts in this repository (`boards/twist/`) and moves to the TWIST hardware repository, as ADR 0017 wants, once the format settles.
- Boards are installed and updated through a Boards manager, as in Arduino IDE 2; the Twist ships with the installer.
- "Board pack" is no longer used: the user sees **Board**.
