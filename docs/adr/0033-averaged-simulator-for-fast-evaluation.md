---
status: proposed, deferred until after slice 4
---

# An averaged simulator target for fast evaluation of ideas; verdicts only from the switched model

The switched simulator of ADR 0028 is slow: about 2 s of computing per 10 ms simulated with exact PWM edges, and minutes for a long sequence. That is fine for checking a result, too slow for trying ideas in class ("what if Kp doubles?"). As Core2 decided in its own ADR 0004 (proposed 2026-11-10), OwnStudio will offer an **averaged simulator** beside the switched one, for fast evaluation only.

## Decision

- **A third target**, "Simulator · averaged", next to "Simulator · switched" and the board. The same procedure runs on it unchanged (ADR 0003): the control code is the same C-Block; only the plant differs, each switching leg replaced by its duty-weighted average.
- **One source of values.** The averaged plant takes its component values from the same setup and `.pulsim` named components (Vin, L, C, Rload), so it cannot drift from the switched plant's parameters.
- **Never a verdict.** An averaged result is information: it can only decide whether an idea is worth a switched run. Requirements are judged only on the switched simulator or the board. Its runs are filed at a test level of their own, **D** (design), and show as INFO.
- **Only when the user asks.** The AI agent never chooses the averaged target on its own initiative, so the user always knows which kind of simulation ran.
- **Visible everywhere.** Results, overlays and timeline dots say "averaged"; in the Simulate view the power block's fidelity chip reads "averaged".

## Considered options

- **Switched only** (today): every idea costs a full switched run.
- **Averaged as a second verdict model:** rejected, as in Core2; two verdict models turn disagreements into arguments about models.
- **The Design sheets' analytic models:** they answer design questions without the firmware; the averaged target runs the actual control code in the time domain, which the sheets do not.
- **Averaged for fast evaluation, at the user's request:** chosen.

## Consequences

- Disagreements between averaged and switched results are expected: they say which plant element matters (ripple, dead time, discontinuous conduction), not that something is broken.
- Whether the averaged plant is built in Pulsim (averaged switch models) or as a small ODE model next to it is decided when the work starts; either way it reads the same named values.
- Core2's ADR 0004 is still proposed; OwnStudio follows whatever Core2 finally adopts, so both use the same rules and the same D level.
