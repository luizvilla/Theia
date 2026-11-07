# Dry run with PhD students: kit

The dry run tests the study before students see it: the mission, the app, the timing, the questionnaire and the facilitators. It is not data for the study. What it finds is fixed before the student session.

**Before the trial runs (Luiz runs them with PhD students, in English, no translation):**
- the mission's challenge: what the starting controller fails, now that the example PI passes the halved load step (#11);
- the three open questions, which are drafts.

The workbench switch lag (#13) is fixed, and step 5 has been done once on the real Twist.

## 1. Who and what

| | |
| --- | --- |
| Participants | 3 to 5 PhD students or colleagues, not involved in OwnStudio, codes PHD-1 … PHD-5 |
| Roles | One facilitator (gives the task, answers only the questions listed below), one observer (notes think-aloud, does not help) |
| Length | 90 min per participant: 5 consent, 65 mission, 10 questionnaire, 10 debrief |
| Setting | One participant at a time. A laptop with OwnStudio and the mission; the Twist on the bench, powered by the facilitator only at step 5 |
| Bench | 30 V supply limited to 1 A, 33 Ω on LOW1 and LOW2, a multimeter. The facilitator stays at the bench during any board run |

## 2. Before each session (facilitator, 10 min)

1. A fresh copy of the mission (`git clone`, branch `mission/buck-voltage-mode`), so nobody sees the previous participant's records or edits.
2. A fresh OwnStudio profile: start it with a new `--user-data-dir` and `THEIA_CONFIG_DIR`, so the study log starts empty. Write the folder down: the log is in `<THEIA_CONFIG_DIR>/ownstudio-study/`.
3. Board: flash `bin/` if `LINK-01` fails; supply **off**; loads connected.
4. Print the consent sheet (`consent-sheet.md`) and the observer sheet (section 6).

## 3. Facilitator script

Read, don't paraphrase, so every participant hears the same thing.

> Thank you for helping. We are testing a teaching tool, not you. You will work on a power electronics exercise with OwnStudio for about an hour, then answer a short questionnaire.
>
> Please think aloud: say what you are looking for, what you expect, what surprises you. My colleague will take notes. I can't help with the exercise itself; I will tell you if something is broken.
>
> Before we start, here is the consent sheet. *(Give it; wait.)* If you agree, open **Mission steps** (bottom left, "Step 1/5"), open "Taking part in the study?", type the code **PHD-n**, tick the box and press **Start the study**.
>
> The mission's steps are in that panel. Press **Start** on a step to begin it and **Done** when you think you are finished. Go at your own pace; you can come back to a step.

**What the facilitator may answer:** where a button or panel is, but only once the participant has looked for a while (note it); whether something is broken; anything about safety at the bench.

**What the facilitator does not answer:** any question about the exercise, power electronics, or what to change in the code. Reply: "What would you try?"

**Step 5 (the board).** When the participant reaches it:
1. The facilitator switches the supply on, after checking: 30 V, limit 1 A, loads connected.
2. The participant runs BUCK-REF-01 on the board from the Lab. OwnStudio asks for confirmation and for the load (33 Ω).
3. The facilitator watches the supply current: stop the run if it goes past 1 A or LOW1 past 16 V. The procedure also stops past 16 V.
4. Supply off once the record is filed.

The load step itself (BUCK-STEP-02) needs a switched load the bench does not have. The board step compares the reference step with its simulation instead.

**Stop the session** if the participant is distressed, if the board behaves unexpectedly, or at 75 minutes on the mission. Note where they were.

**At the end:** press **Questionnaire** in the Mission steps panel. Then **Export step times**. Leave the computer to the observer for the debrief.

## 4. Debrief (10 min, observer leads)

1. What did you expect the tool to do that it didn't?
2. Where were you lost? Show me.
3. The comparison between simulation and board (step 5): did you trust it? Why?
4. Is there anything you would remove?

## 5. After each session

- Copy `<THEIA_CONFIG_DIR>/ownstudio-study/PHD-n.jsonl` and `PHD-n-steps.csv` to the study folder; then delete the profile.
- Scan the observer sheet.
- Within a day: a short note, each problem with its step and its severity (blocks / slows / cosmetic).

## 6. Observer sheet

One line per event. Time from the app clock.

| Time | Step | What happened (quote the participant when you can) | Kind | Severity |
| --- | --- | --- | --- | --- |
| | | | lost / error / surprise / help asked / workaround / praise | blocks / slows / cosmetic |

**Look for in particular:**
- **Step 2 (sizing):** do they find that the Twist's filter cannot meet REQ-UNDERSHOOT on its own? Do they read the formulas?
- **Step 3 (simulation):** do they understand why BUCK-STEP-01b fails? Do they open the waveform?
- **Step 4 (control law):** do they use the Bode plot, or change gains at random? Do they ask the AI (if enabled)? Do they break `control.cpp`?
- **Step 5 (board):** do they understand the overlay? Do they notice that simulation and board differ, and why?
- **Everywhere:** do they find the Mission steps panel again after switching workbench? Do they notice the status bar step?

## 7. What the dry run decides

| Question | Decided from |
| --- | --- |
| Is 65 minutes enough for the five steps? | Step times (CSV), where people stopped |
| Is the mission solvable as written (#11)? | Step 4: how many reach a passing BUCK-STEP-01b, and how |
| Do the steps' texts suffice without help? | "help asked" lines |
| Is the questionnaire clear? | Debrief, empty answers |
| Is the bench part safe and smooth with one facilitator? | Facilitator's note |

Each answer becomes a change, an issue on `luizvilla/Theia`, or "no change", before the student session.
