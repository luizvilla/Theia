---
status: amended by ADR 0031 (power only through an OwnStudio token; AI takeover)
---

# The AI agent works at three autonomy levels; hardware safety never depends on it

The AI agent may freely edit files, run Design calculations and run the simulator target. It must ask for confirmation each time before flashing the board or starting a bench run outside an authorized campaign. It may never change the safety envelope or bypass a trip. A human may grant the agent the right to run automated bench tests unattended, but only after the instrument current and voltage limits have been set and confirmed within the safety envelope, so that the physical limits, not the agent, guarantee safety.

The right is granted per test campaign: the human approves the campaign, the Lab workbench reads the limits back from the instruments and refuses to start if they exceed the safety envelope, and any trip ends the right until a human re-arms.
