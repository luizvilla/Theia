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
One of the five functional parts every converter is described with: power, measurement, control, driver and auxiliary power supply.
_Avoid_: module, subsystem, stage (unqualified)

**Power block**:
The switches, the filters, the protection devices (fuses, relays, PTCs), the power connectors, the thermal interfaces and the hot side of the sensors.
_Avoid_: power stage (acceptable in speech), plant (reserved for the simulated model)

**Measurement block**:
The circuits that receive the sensor signals, condition and amplify them, and deliver them to the microcontroller pins.
_Avoid_: sensing, acquisition, sensors (the hot side of the sensors belongs to the power block)

**Control block**:
The microcontroller with its ADCs, everything related to industrial informatics including communication with the outside world, PWM generation, and the commands that actuate relays and trips.
_Avoid_: controller (when meaning the hardware), MCU (unqualified). _Name under review in round 3._

**Driver block**:
The hardware that receives PWM signals and switches the power switches, bootstrapped or not; it is chosen for, and depends on, the switches it drives.
_Avoid_: gate stage, driver (when meaning a software driver)

**Auxiliary power supply (APS)**:
The block at the centre that takes a small amount of energy and supplies the measurement, control and driver blocks, including start-up, filtering that keeps the digital ground quiet, and its own protection.
_Avoid_: feeder (in writing; Luiz's long-standing name for it, still understood in speech), aux, housekeeping supply

**Isolation barrier**:
The galvanic separation between power and control sides; where it sits among the blocks depends on the converter type and the applicable standards.
_Avoid_: isolation (unqualified)

**Power ground** / **Digital ground**:
The two ground references of a converter: the power side's and the control side's.
_Avoid_: GND (unqualified), earth (that is protective earth)

## Environment

**Environment**:
Everything outside the converter that a test needs: whatever supplies and absorbs the converted energy, and the instruments and systems the converter or the bench talks to.
_Avoid_: test bench (that is the physical setup), surroundings, system (unqualified)

## Workbenches

**Workbench**:
One of three views of the converter project, each devoted to one activity: Design, Code or Lab.
_Avoid_: page, perspective (Theia's implementation term), mode

**Design workbench**:
Where requirements are set and the converter's hardware and control are designed with models that do not run the firmware.
_Avoid_: simulation workbench

**Code workbench**:
Where the firmware that runs on the control block is written.
_Avoid_: firmware IDE

**Lab workbench**:
Where test procedures run the real firmware against a target and file test records.
_Avoid_: test bench (that is the physical setup), experiment workbench

**Target**:
Where the firmware runs during a test campaign: inside the simulator against the plant model, or on the real control block against real hardware.
_Avoid_: platform, backend, execution mode

**Home**:
The landing view of a converter project: its block diagram, from which each block opens what belongs to it.
_Avoid_: dashboard, start page
