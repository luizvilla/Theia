# A setup canvas of typed-port nodes, always visible, with an inspector

The bottom of the window holds the **setup canvas** in every workbench. The user drags parts from a palette (DC source, Twist, resistor) and wires their power ports. Nodes carry their values and live state (the source shows its set and measured voltage). The board node opens to a second level, the inside of the board, drawn from its devicetree (ADR 0032). Clicking any node or inner block shows it in the **inspector** on the right panel: its settings, its requirements and test states, and three buttons, Design, Code and Tests. The canvas background changes with the workbench (Design, Code, Lab, Simulate), and what it shows changes with it: values in Design, files and functions in Code, probes and readings in the Lab, fidelity chips in Simulate.

Topology is checked by typed ports. For the first version exactly one source on HIGH, one Twist and one load on LOW1 (LOW2 may share the load) are allowed; a wire that breaks the rule does not snap, and the canvas says why. More topologies are added as rules.

Style C of the [canvas style board](../design/canvas-styles.html) was chosen: nodes with typed ports, a parts palette as in style D, and a small board picture in the board node's header.

## Considered options

- **Front panels** (Typhoon HIL SCADA): reads like the bench, but each instrument needs artwork and the circuit is hidden.
- **Schematic** (PLECS, PulsimGui): invites circuit editing, which belongs in PulsimGui (ADR 0028).
- **Illustrated bench** (Wokwi): friendliest, most artwork per part, settings still need an inspector.
- **Nodes with typed ports**: chosen. Values on the nodes, rules visible as wires that do not snap, new boards need no artwork.

## Consequences

- Home's five-block diagram is replaced by the board node's inside view; Home itself becomes the Start page.
- The canvas is the place where the operating profile is set (source voltage and limit, load), and the Lab checklist compares it with measurements.
- Instruments (an oscilloscope with probes on Spin pins) are in the canvas model from the start, shown in the interface later.
