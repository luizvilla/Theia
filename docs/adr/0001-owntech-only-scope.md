# v1 supports only OwnTech hardware

v1 targets the OwnTech stack only (Spin control board, Twist and the other OwnTech power boards, the Power API on Zephyr through PlatformIO), and may be limited to the Twist alone if that keeps the first version simpler. A neutral hardware abstraction was rejected for now: there is no second target to shape it, and imperix and PLECS both reached a usable workflow by starting from one target and adding target support packages later. The code keeps a "target" seam so a second target can be added, but none is built.
