# Trying OwnStudio 2.0 (slice 1)

This is for your test session: the nine steps of SPEC §2, on the Twist, in one or two hours. The question at the end is the exit criterion of slice 1: **is it good enough**, functional with no problem you could have caught yourself?

## Before you start

```sh
cd ~/code/examples && git checkout ownstudio/buck-extras      # the buck example with OwnStudio's firmware (E21)
cd /data/ownstudio/Theia && (cd app && npm run build)          # if the app changed since the last build
scripts/try-ownstudio.sh
```

**To keep focus while testing**, open [bench-checklist.html](bench-checklist.html) in a browser (`xdg-open docs/bench-checklist.html`): one step at a time, what to do, what you told me in the grilling rounds, a few checks, a verdict and notes. It keeps your answers in that browser; at the end, **Download notes.md** into your trial folder.

The script gives you a fresh OwnStudio home and profile under `/data/ownstudio/try/<date-time>/`: your setups go to `home/setups/`, and it creates `notes.md` with one heading per step. Nothing touches `~/OwnStudio` or an earlier trial; run it again for a clean start.

The Twist on USB, the supply **off** until step 5 (30 V, 1 A limit, 33 Ω on LOW1, as at the bench session). Switching on happens only in step 5, only with you there.

Known limits, so you don't lose time on them:
- **The AI.** Claude Code needs its agent SDK on the machine: `npm install -g @anthropic-ai/claude-agent-sdk`. Codex as Theia ships it (0.49) refuses your `~/.codex/config.toml` because of `model_reasoning_effort = "xhigh"`; set `high` while you try it, or skip the AI. See the U17 row of the plan.
- **The simulator** compiles `control.cpp` against OwnTech's control library. The script points it at a cached copy; a setup does not yet find the copy PlatformIO downloads.
- **Slice 2 and later** items say so in the menus ("(slice 2)"); clicking one tells you which step brings it.

## The nine steps

**1. Source, Twist and load.** On the Start page, click **New setup on the Twist** and give it a name. The window opens on the setup. In the **Parts** tab (right), drag a **DC source**, then a **Resistor** onto the canvas (bottom), and wire the source to **HIGH** and the resistor to **LOW1**. Try a wrong wire (a resistor on HIGH): it should refuse with one sentence. The parts come with your bench's values (30 V, 1 A limit, 33 Ω); selecting one shows them in the Inspector. Typing a value on the canvas is slice 2 (the editable inspector); in slice 1, Vin and Rload change through PulsimGui (step 6) and L and C through Design (step 8).

**2. The inside of the Twist.** Double-click the Twist. Five blocks on your reference layout; click **Driver**: the Inspector shows the legs, 200 kHz, 100/100 ns, up-down, read from Core's devicetree. Read-only in slice 1.

**3. Load an example.** **File › Examples › Examples of the board…**, then **buck voltage mode**. It lands on its own branch (`buck-voltage-mode`, status bar and timeline); the previous `src/` stays on the setup's first branch.

**4. Build and flash.** In **Code**, open `src/main.cpp` or `src/control.cpp`: the toolbar above the editor has **Build**, **Upload**, **Build and upload**. Build takes about a minute (progress in **Build output**); then Upload. The Twist on the canvas shows the firmware's identity, and the Lab checklist's **Firmware** line turns green when the board reports the same build.

**5. Switch on and capture.** Supply on. In **Lab**, the checklist (left) must reach 6/6: board, firmware, HIGH measured within 10 % of the canvas, outputs, load, procedure. Then **Capture from the board**, read the dialog, confirm. The reference steps from 10 to 12 V; the result opens on the step (drag to zoom, Shift+wheel to pan, **Whole run**).

**6. The simulator, same parameters, its circuit.** On the result, **Open in PulsimGui**: the setup's own plant, with the canvas's 30 V, 33 Ω, L and C applied, and your `control.cpp` as its C-Block. Change a value there and save: the canvas follows.

**7. Simulate over the measurement.** Back in the result, **Simulate at these conditions**: the simulation (dashed) is drawn over the measurement (solid), with the metrics side by side.

**8. Change a parameter in Design.** **Design** (left): **Output filter**. Drag **L per leg**: the ripple and its curve follow live; releasing puts L on the Twist on the canvas and in the plant, and adds a dot to the timeline. **Control loop**: change Kp or Ti and watch the Bode plot and margins; **Apply to the code** writes them into `control.cpp`. **Show the formulas** opens the Python behind each sheet, in your setup.

**9. Again, and back in time.** Build and upload, capture again, simulate again. Every change, build, run and simulation is a dot on the **timeline** (bottom). Click an earlier dot: the preview shows what differs from now; **Restore here** goes back (canvas, code, Lab all follow), **Back to latest** returns. Editing from a restored dot starts a branch; nothing is lost. **History › Milestone…** names the current state.

**The AI (optional).** The **AI** tab (right): type `@` to pick **ClaudeCode** or **Codex**, signed in with your own account. They read the setup's `AGENTS.md`; neither can switch power on through OwnStudio, and Codex runs in a sandbox that cannot open the serial port. Claude Code asks before every shell command: the power limits are in ADR 0031's open point, which needs your decision.

## Taking notes

Write in `notes.md` as you go, under the step you are on: where, what happened, what you expected, and a mark (**bug**, **friction**, **missing**, **idea**, **good**). Screenshots can go in the same folder. Don't sort or polish: the grilling afterwards turns them into decisions.

## After testing

Send me the path of your `notes.md`. We go through it one round of questions at a time, until we agree whether slice 1 is good enough, and what slice 2 changes first. The slice report ([step-5-slice-1-report.md](step-5-slice-1-report.md)) puts every storyboard frame beside its screenshot, and lists what waits for you.
