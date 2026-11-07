# Trying OwnStudio yourself

## Start it

```sh
cd /data/ownstudio/Theia
scripts/try-ownstudio.sh
```

The script works on a **fresh copy** of the buck mission, with a fresh profile, under `/data/ownstudio/try/<date-time>/`, so nothing you do touches the real mission repository. It prints where your copy and your `notes.md` are. Run it again for a clean start.

With the Twist on USB, the status bar shows the board on the right. Switch the supply on only for step 5, as at the bench session.

## A first pass: as a student (about an hour)

Click **"Step 1/5"** in the status bar (bottom left): the Mission steps panel opens. Follow the five steps without reading anything else, as a student would:

1. **Read the requirements** (Home). Try the three layers: Specification, Build, Verification.
2. **Size the output filter** (Design). The sizing table, then the Bode plot further down.
3. **Run the tests in simulation** (Lab). BUCK-STEP-01 passes; BUCK-REF-01 fails REQ-TRACKING. That's the exercise.
4. **Improve the control law** (Design, then Code). Tune Kp and Ti on the Bode plot, "Apply to control.cpp", run BUCK-REF-01 again. Can you get under 10 ms without peeking at `tests/test_mission_is_solvable.py`?
5. **Run the reference step on the board** (Lab). This needs your firmware on the board. Build it from the Lab or the command line, or flash `bin/` for the shipped PI. Supply on, then "Run on the board". Open the result from the control center ("board run") to see measurement and simulation together.

You can also try the study's consent and questionnaire in that panel. The log goes to the trial folder, not anywhere else.

## A second pass: as the instructor

- **Control center** (Lab): does it tell you what has been tested, where, and what's broken?
- **Home, Verification layer:** do the block colours and badges make sense?
- **Safety panel and data object table** (Lab).
- **Code with AI:** needs a key. Settings → search "AI" → enable, paste an Anthropic key (or point to a local Ollama), then ask the OwnStudio agent in the chat to help with REQ-TRACKING.
- **The command line,** if you want: `docs/step-4-report.md`, "How to run things".

## Taking notes

Write in `notes.md` as you go: one line per remark, with where, what happened, what you expected, and a mark (**bug**, **friction**, **missing**, **idea**, **good**). Screenshots can go in the same folder. Don't sort or polish: the grilling afterwards turns them into decisions.

## After testing: the grilling

Send me the path of your `notes.md`. I'll grill you on it, one round of questions at a time, until we agree on:
- the objective for the next step, what OwnStudio must do better first;
- what changes in the specification and the ADRs;
- the commit plan.

[docs/architecture.md](architecture.md) lists the engineering choices I made on my own (section 5); mark any you want to revisit in your notes too.
