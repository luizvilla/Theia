# Twist buck plant

`twist_buck.pulsim` is the switched leg-1 model accepted in step 4, now as
the board-owned PulsimGui project required by ADR 0028. Its named setup values
are `Vin`, `Rload`, `L`, and `C`; OwnStudio changes those by name after loading
the project, without rebuilding the schematic.

The physical defaults retain the step-4 evidence:

- 40 V input and 200 kHz complementary PWM with 100 ns dead time;
- 33 µH Twist inductor;
- 3 × 4.7 µF LOW ceramics (`C`) plus the switched 47 µF electrolytic through
  0.70 Ω ESR and the assumed 0.22 Ω connection-switch resistance;
- 10 mΩ power switches, 0.7 V body diodes, and a 6 Ω default load;
- a 24 Ω step load used by the accepted 1 A → 1.5 A procedure.

`control_block.cpp` is deliberately only an ABI adapter. The runner compiles it
with the setup's `src/control.cpp` and host dependencies, while the PWM adapter
turns its duty output into the plant's exact switching edges. Files under
`shim/` replace only CMSIS numeric types and Zephyr logging for that host build;
they are never part of the board firmware.
