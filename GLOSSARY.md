# OwnStudio

An application that starts from a board, lets the user wire it into a setup, and carries that setup from design through code to measurements compared with simulation, in three workbenches that all work on the same setup.

## Boards, examples and setups

**Board**:
The OwnTech hardware a user starts from (Twist, Spin, Ownverter); choosing it opens its examples, its design sheet, its procedures and its plant model.
_Avoid_: board pack, BSP, platform

**Example**:
Firmware for one board, listed in the OwnTech examples collection, that a user loads into a setup to get going in seconds.
_Avoid_: mission, template, demo, sketch

**Setup**:
A source, a board and a load as wired on the bench, together with the board's settings, the firmware, the procedures, the reports and the history that go with them, kept as one folder; the single shared object every workbench reads and writes.
_Avoid_: converter project (SPEC 1.0), workspace, project (unqualified), experiment

**Tutorial**:
An optional guided walk over a setup that teaches the tools step by step.
_Avoid_: mission (SPEC 1.0), lesson, course

**Library**:
A body of code a setup's firmware builds against, such as the control library or ScopeMimicry, tracked with its own history and remotes.
_Avoid_: dependency (unqualified), package, module

**Timeline**:
The history of a setup shown as a row of dots, one per saved state, from which any earlier state can be previewed or restored, and from which a branch can start.
_Avoid_: undo history, checkpoints, versions (unqualified)

**Milestone**:
A state on the timeline that the user named.
_Avoid_: tag, release, checkpoint

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
_Avoid_: test bench (that is the physical bench), surroundings, system (unqualified)

**Power port**:
A point where the power block exchanges energy with the environment, named for what is connected to it; its voltage side (high or low), its kind (DC or AC) and its allowed power direction are properties of the port, not its name.
_Avoid_: input, output, source, load (these change with power direction)

**Source** / **Load**:
A part of the environment, placed on the setup canvas, that supplies energy to a power port (source) or absorbs it (load), with its own values such as voltage, current limit or resistance; ports are not named after them.
_Avoid_: input, output (for the parts), supply (in writing; acceptable in speech for a DC source)

**Instrument**:
A part of the environment that measures or drives the setup from outside the board, such as an oscilloscope, a programmable supply or an electronic load.
_Avoid_: device (unqualified), equipment

**Instrument driver**:
The code a procedure uses to command or read one instrument.
_Avoid_: driver (unqualified; that is the driver block), plugin

## Safety

**Safety envelope**:
The maximum voltage, current and temperature allowed at each power port, at or below the board ratings, declared once per setup and enforced by firmware trips, instrument limits, simulator checks and component ratings.
_Avoid_: limits (unqualified), ratings (those belong to components)

**Protection chain**:
One protective function traced across the blocks it passes through, from the quantity sensed to the action taken, with its threshold.
_Avoid_: protection (unqualified), safety loop

## Testing

Terms taken from Core2's testing vocabulary, with level L2 added for the bench.

**Test procedure**:
The document or script that defines test cases, the order in which they run, and how their results are recorded.
_Avoid_: test plan, test spec

**Test case**:
One identified check with a fixed setup, stimulus and numeric pass criteria, verifying one or more requirements.
_Avoid_: test, scenario (when meaning the whole check)

**Test campaign**:
One run of a set of test cases against a single build identity and a single target.
_Avoid_: test session, test run (when meaning the whole set)

**Test record**:
The filed evidence of a test campaign: setup, versions, per-criterion verdicts and raw data.
_Avoid_: report (that is the light summary), log, result file

**Report**:
A light, shareable summary of one or more test records: plots, conditions, verdicts and the timeline state they came from, without the raw data.
_Avoid_: test record (that is the evidence), export

**Test level**:
How much of the system a test case exercises: L0 one object with synthetic inputs, L1 closed loop against the switched plant model on the simulator target, L2 closed loop on the bench; and D, design runs on the averaged plant model, whose results are information only.
_Avoid_: stage, phase

**Firmware scope**:
A triggered capture buffer inside the firmware that records fast signals from the board's own sensors and is downloaded after the event.
_Avoid_: oscilloscope (that is an instrument), scope (unqualified)

**Probe**:
A point of observation placed on the setup canvas, on a node, a block or a pin, that names what a procedure records.
_Avoid_: channel (that is the scope's), sensor (that is hardware), tap

**Monitor**:
The slow way of observing a probe: values read periodically over the data link, shown on widgets and rolling plots, for algorithms and state machines.
_Avoid_: logging, streaming, telemetry

**Capture**:
The fast way of observing a probe: a triggered recording by the firmware scope, read after the event, for step responses and other fast transients.
_Avoid_: snapshot, acquisition (unqualified), recording (unqualified)

## Workbenches

**Workbench**:
One of three views of the setup, each devoted to one activity: Design, Code or Lab.
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
Everything a run in the Lab needs: the check that the setup is ready, a test sequence, and the handling of the data afterwards into a test record and a report.
_Avoid_: script (unqualified), test (unqualified), supervisor

**Test sequence**:
The ordered steps of a procedure (set values, switch the converter on and off, wait, capture, monitor, check), drawn as nested blocks and kept as Python.
_Avoid_: flowchart, test plan, script (unqualified)

**Lab checklist**:
The conditions checked continuously before and during a run on the board (the right board, the right firmware, the measured input matching the setup, limits, a load, a valid procedure); a run may start only while every one holds.
_Avoid_: preflight, interlock (that is hardware)

**AI takeover**:
The user's grant to the AI agent to run one test sequence on the board, power included, for a limited time, ended by any failed check, any change to the setup, or Stop.
_Avoid_: autopilot, unattended mode

**Data object**:
One named value a firmware exchanges with the outside world through ThingSet, with its unit and access.
_Avoid_: variable (unqualified), register, parameter (unqualified)

**Data object table**:
The table view of all data objects of a firmware, edited by the user and stored as a text file from which the firmware's declarations are generated; it is shared by panels, procedures, the AI agent, test records and the simulator target, and adding a row adds a data object.
_Avoid_: variable dictionary, object tree (ThingSet's term), register map

**Build identity**:
The git commit, dirty flag and binary hash compiled into a firmware and reported by the board, used to tell whether the board runs the project's code.
_Avoid_: firmware version (unqualified), hash (unqualified)

**Start page**:
What OwnStudio shows when no setup is open: the boards to choose from, recent setups, the chosen board's examples and the tutorials.
_Avoid_: Home (SPEC 1.0), landing page, dashboard

**Setup canvas**:
The drawing of the setup, always visible at the bottom of the window, where sources, boards, loads and instruments are placed and wired, and which opens to the inside of a board.
_Avoid_: schematic (that is the plant model's), diagram (unqualified), Home

**Inspector**:
The side view that shows the settings, requirements and test states of whatever is selected on the setup canvas, with the ways into Design, Code and Tests.
_Avoid_: properties panel, details

**Specification layer** / **Build layer** / **Verification layer**:
Three ways of looking at a setup that carries requirements: what the converter must do (requirements, safety envelope), what it is (blocks, ports, firmware), and what has been shown (each requirement coloured by its latest test record).
_Avoid_: evidence (a false friend in French), data, validation (in V-model terms validation is the final check against the need, not a per-requirement check)

## Boards and models

**Board description**:
The versioned file, kept with a board's hardware sources, that states the board's facts the firmware's devicetree does not: port ratings, component values, operating modes and which bridge blocks are isolated.
_Avoid_: datasheet (that is a document for people), board file, BSP

**Board rating**:
A limit of the hardware itself, taken from the board description and not editable in a setup.
_Avoid_: envelope (that is the project's chosen limit, at or below the rating)

**Board definition**:
A board's devicetree overlay together with its board description: everything OwnStudio needs to offer a board, including a custom one.
_Avoid_: board pack, board support package

**Plant model**:
The simulated power block and environment that the firmware acts on when the target is the simulator.
_Avoid_: simulation, model (unqualified), digital twin

**Averaged plant model**:
A plant model in which each switching leg is replaced by its duty-weighted average, used to evaluate ideas quickly and never to judge a requirement.
_Avoid_: average model, small-signal model (that is a linearisation), simplified model

**Fidelity**:
How closely the simulator reproduces one block of the board: as on the board, simplified, or not simulated.
_Avoid_: accuracy (that is a measured error), level of detail

**Simulation backend**:
The part of the OwnTech API that, when the target is the simulator, takes measurements from and gives PWM commands to the plant model instead of the hardware, so the rest of the API runs unchanged.
_Avoid_: virtual board, mock API, emulator
