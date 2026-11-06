# v1 starts from the Twist; the Ownverter is the first extension

Within the OwnTech-only scope of ADR 0001, v1 is built around the Twist. Its Design story is "size it yourself, then compare with what was chosen for the real board", which satisfies ADR 0006 without requiring users to build hardware. The Ownverter (no output filter, so a real filter design task) was rejected for v1 because its AC control (PLL, resonant controllers, dq frames) is too heavy for first-time students and teaching colleagues in a first session. It is the first extension.
