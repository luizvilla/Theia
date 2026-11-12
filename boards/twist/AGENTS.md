# Working in an OwnStudio setup (Twist)

This folder is an OwnStudio **setup**: a clone of OwnTech Core on its own git
branch, for a Twist power converter driven by a Spin board. You are helping a
student or engineer who works in the OwnStudio app. Read this before changing
anything.

## Power: never switch the converter on

The Twist is wired to a real supply and load. **Never switch power on, and
never try to.** That means:

- do not run a procedure with `--target board`, and do not pass any
  `--power-token` or `--power-token-file` argument;
- do not write `Converter/Mode` or any other ThingSet value, and do not open
  the board's serial port (`/dev/ttyACM*`, `COM*`) yourself;
- do not flash firmware; the user builds and uploads from the Code toolbar.

Board runs happen only in OwnStudio's Lab, after the user has read the
checklist and confirmed in a dialog. If a task needs a measurement, say what
to run and let the user do it. The simulator is always allowed:

```sh
python -m ownstudio_lab.procedure . default-capture --target simulator
```

## Where things are

| Path | What | Who changes it |
|---|---|---|
| `src/main.cpp` | The firmware: `setup_routine()` configures the Twist, the tasks call the control | You, with the user |
| `src/control.cpp`, `src/control.h` | The control law, hardware-free (`control_step()`); the simulator compiles the same file | You, with the user |
| `ownstudio/setup.yaml` | The setup canvas (source, Twist, load and their values) | OwnStudio; do not edit while the app is open |
| `ownstudio/design/*.py` | The Design sheets: readable formulas (`--json` for the app) | You may read and improve them |
| `ownstudio/plant/` | The simulation model (`.pulsim`, opened with PulsimGui) and its C-Block wrapper | The user, through PulsimGui |
| `ownstudio/records/` | Raw run records (not in git) | OwnStudio |
| `ownstudio/reports/` | HTML reports of runs | OwnStudio |
| `docs/`, `owntech/`, `zephyr/` | OwnTech Core: APIs (`docs/powerAPI.md`, `docs/spin_pwm.md`, `docs/task_introduction.md`…) and the board's devicetree | Read only |

The Core commit this setup started from is `core:` in `ownstudio/setup.yaml`.
The Twist's pins, legs, frequencies and sensors are in its devicetree overlay,
`zephyr/boards/shields/twist/twist_v1_4_2.overlay`; read values from there
rather than guessing.

## How to check your work

- Build: `pio run` (PlatformIO, environment `USB`). The user uploads.
- Control gains and filter values: `python ownstudio/design/control_loop.py`
  and `python ownstudio/design/output_filter.py` print the margins and ripple.
- Behaviour: run a procedure on the simulator (above); results go to
  `ownstudio/records/`.

## History

OwnStudio commits at events (canvas changes, builds, runs, design changes) and
shows them on its timeline. Commit your own work with a clear message when the
user agrees; never rewrite history, force-push or delete branches.
