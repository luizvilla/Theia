# Simulation is a target, not a workbench

There is no simulation workbench. Models that do not run the firmware (averaged, small-signal, Bode, compensator design) belong to the Design workbench. Every run of the real firmware belongs to the Lab workbench, where the simulator (Pulsim, through the hardware-free control step seam) and the real board are two targets of the same test procedure. This follows imperix's "model execution purpose" switch, and removes the overlap that appeared when simulation was placed both in Design and in Lab.
