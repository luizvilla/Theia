# Power electronics workbench

An application that carries one power converter from requirements to a validated prototype, through three workbenches that all work on the same converter project.

## Project

**Converter project**:
The single shared object that every workbench reads and writes: the converter's requirements, its blocks, its plant model, its firmware, its test procedures and its test records.
_Avoid_: workspace, design, model (unqualified)

**Requirement**:
A numeric property the converter must meet, stated with a value, a tolerance and the conditions under which it is checked.
_Avoid_: spec (unqualified), target (reserved, see Target)

## Converter blocks

**Converter block**:
One of the five functional parts every converter is described with: power, measurement, controller, driver and auxiliary power supply.
_Avoid_: module, subsystem, stage (unqualified)

**Power block**:
The switches, the filters, the protection devices (fuses, relays, PTCs), the power connectors, the thermal interfaces and the hot side of the sensors.
_Avoid_: power stage (acceptable in speech), plant (reserved for the simulated model)

**Measurement block**:
The circuits that receive the sensor signals, condition and amplify them, and deliver them to the controller block's pins.
_Avoid_: sensing, acquisition, sensors (the hot side of the sensors belongs to the power block)

**Controller block**:
The device that runs the control law, usually a microcontroller with its ADCs, together with communication with the outside world, PWM generation and the commands that actuate relays and trips; it may also be an analog controller IC.
_Avoid_: control block, control (unqualified), industrial informatics block, MCU (unqualified)

**Control law**:
The mathematical rule, designed in the Design workbench, by which the controller block turns measurements into commands.
_Avoid_: control (unqualified), controller (when meaning the law), compensator (acceptable for a linear control law)

**Driver block**:
The hardware that receives PWM signals and switches the power switches, bootstrapped or not; it is chosen for, and depends on, the switches it drives.
_Avoid_: gate stage, driver (when meaning a software driver)

**Auxiliary power supply (APS)**:
The block at the centre that takes a small amount of energy and supplies the measurement, controller and driver blocks, including start-up, filtering that keeps the digital ground quiet, and its own protection.
_Avoid_: feeder (in writing; Luiz's long-standing name for it, still understood in speech), aux, housekeeping supply

**Bridge block**:
The measurement, driver or auxiliary power supply block: the three blocks that connect the power side to the controller side, and the only ones an isolation barrier can cross.
_Avoid_: interface block

**Isolation barrier**:
The galvanic separation between the power side and the controller side, recorded as whether each bridge block is isolated and with which insulation class; where it falls depends on the converter type and the applicable standards.
_Avoid_: isolation (unqualified), insulation (when meaning the barrier as a whole)

**Power ground** / **Digital ground**:
The two ground references of a converter: the power side's and the controller side's.
_Avoid_: GND (unqualified), earth (that is protective earth)

## Environment

**Environment**:
Everything outside the converter that a test needs: whatever supplies and absorbs the converted energy, and the instruments and systems the converter or the bench talks to.
_Avoid_: test bench (that is the physical setup), surroundings, system (unqualified)

**Power port**:
A point where the power block exchanges energy with the environment, named for what is connected to it; its voltage side (high or low), its kind (DC or AC) and its allowed power direction are properties of the port, not its name.
_Avoid_: input, output, source, load (these change with power direction)

## Safety

**Safety envelope**:
The maximum voltage, current and temperature allowed at each power port, at or below the board ratings, declared once per converter project and enforced by firmware trips, instrument limits, simulator checks and component ratings.
_Avoid_: limits (unqualified), ratings (those belong to components)

**Protection chain**:
One protective function traced across the blocks it passes through, from the quantity sensed to the action taken, with its threshold.
_Avoid_: protection (unqualified), safety loop

## Workbenches

**Workbench**:
One of three views of the converter project, each devoted to one activity: Design, Code or Lab.
_Avoid_: page, perspective (Theia's implementation term), mode

**Design workbench**:
Where requirements are set and the converter's hardware and control law are designed with models that do not run the firmware.
_Avoid_: simulation workbench

**Code workbench**:
Where the firmware that runs on the controller block is written.
_Avoid_: firmware IDE

**Lab workbench**:
Where test procedures run the real firmware against a target and file test records.
_Avoid_: test bench (that is the physical setup), experiment workbench

**Target**:
Where the firmware runs during a test campaign: inside the simulator against the plant model, or on the real controller block against real hardware.
_Avoid_: platform, backend, execution mode

**Panel**:
A Lab view for hands-on operation of a target: it shows incoming data objects and lets the user set data objects or launch a procedure, and holds no logic of its own.
_Avoid_: dashboard (modular's term, acceptable in speech), SCADA, GUI

**Procedure**:
A Python script that drives a target through a fixed sequence and files a test record.
_Avoid_: script (unqualified), test (unqualified), supervisor

**Data object**:
One named value a firmware exchanges with the outside world through ThingSet, with its unit and access.
_Avoid_: variable (unqualified), register, parameter (unqualified)

**Data object table**:
The editable table of all data objects of a firmware; it is shared by panels, procedures, the AI agent, test records and the simulator target, and adding a row adds a data object.
_Avoid_: variable dictionary, object tree (ThingSet's term), register map

**Build identity**:
The git commit, dirty flag and binary hash compiled into a firmware and reported by the board, used to tell whether the board runs the project's code.
_Avoid_: firmware version (unqualified), hash (unqualified)

**Mission**:
A guided path from the landing page that opens a pre-filled converter project, including its firmware source for the student to iterate on, and ends in a real result.
_Avoid_: tutorial, lesson, example (an OwnTech example is what a mission is usually derived from)

**Home**:
The landing view of a converter project: its block diagram, from which each block opens what belongs to it, shown in one of three layers.
_Avoid_: dashboard, start page

**Specification layer** / **Build layer** / **Verification layer**:
The three layers of Home: what the converter must do (requirements, safety envelope), what it is (blocks, ports, firmware), and what has been shown (each requirement coloured by its latest test record).
_Avoid_: evidence (a false friend in French), data, validation (in V-model terms validation is the final check against the need, not a per-requirement check)

## Boards and models

**Board description**:
The versioned file, kept with a board's hardware sources, that states the board's facts the firmware's devicetree does not: port ratings, component values, operating modes and which bridge blocks are isolated.
_Avoid_: datasheet (that is a document for people), board file, BSP

**Board rating**:
A limit of the hardware itself, taken from the board description and not editable in a converter project.
_Avoid_: envelope (that is the project's chosen limit, at or below the rating)

**Plant model**:
The simulated power block and environment that the firmware acts on when the target is the simulator.
_Avoid_: simulation, model (unqualified), digital twin

**Simulation backend**:
The part of the OwnTech API that, when the target is the simulator, takes measurements from and gives PWM commands to the plant model instead of the hardware, so the rest of the API runs unchanged.
_Avoid_: virtual board, mock API, emulator
