# Power electronics workbench

An application that carries one power converter from requirements to a validated prototype, through three workbenches that all work on the same converter project.

## Project

**Converter project**:
The single shared object that every workbench reads and writes: the converter's requirements, its blocks, its plant model, its control code, its test procedures and its test records.
_Avoid_: workspace, design, model (unqualified)

**Requirement**:
A numeric property the converter must meet, stated with a value, a tolerance and the conditions under which it is checked.
_Avoid_: spec (unqualified), target (that word is reserved, see Target)

## Converter blocks

**Converter block**:
One of the five functional parts every converter project is described with: power, measurement, control, driver and feeder.
_Avoid_: module, subsystem, stage (unqualified)

**Power block**:
The switching cells and passive components that process the converted energy.
_Avoid_: power stage (acceptable in speech), plant (that word is reserved for the simulated model)

**Measurement block**:
The sensors and signal conditioning that turn power-block quantities into signals the control block can sample.
_Avoid_: sensing, acquisition

**Control block**:
The microcontroller and the code it runs, which turns measurements into PWM commands.
_Avoid_: controller (when meaning the hardware), MCU (unqualified)

**Driver block**:
The gate drivers that turn the control block's PWM signals into switch commands in the power block.
_Avoid_: gate stage, driver (when meaning a software driver)

**Feeder block**:
The auxiliary supply that takes a little energy and powers the measurement, control and driver blocks.
_Avoid_: (under review in round 2)

## Workbenches

**Workbench**:
One of three views of the converter project, each devoted to one activity: Design, Code or Lab.
_Avoid_: page, perspective (that is Theia's implementation term), mode

**Design workbench**:
Where requirements are set and the converter and its control are designed with models that do not run the firmware.
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
