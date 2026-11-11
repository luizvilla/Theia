Copies of two OwnTech Core devicetree files (LGPL-2.1, OwnTech), used by
`test_board_definition.py` so the test runs without a Core clone:
`zephyr/boards/shields/twist/twist_v1_4_2.overlay` and
`zephyr/boards/owntech/spin/spin_header.dtsi`. The test also reads a live
Core clone when `OWNSTUDIO_CORE` names one.
