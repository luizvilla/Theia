# Test record: BUCK-STEP-01 load step

- Verdict: **FAIL**
- Level L1, target simulator, 2026-11-07T01:17:54+00:00
- Mission commit `85bbe9429030` (dirty: not reproducible)
- Versions: python 3.12.3, pulsim 2.0.0, numpy 2.4.6, control_library 1ef8097, compiler g++ (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0

| Case | Requirement | Check | Measured | Expected | Criterion | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| BUCK-STEP-01a | REQ-VOUT | mean LOW1 voltage before the load step | 11.99 V | 12 V | within 2% of 12.0 V | PASS |
| BUCK-STEP-01b | REQ-UNDERSHOOT | lowest LOW1 voltage after the 1 A to 2 A step | 11.11 V | 11.4 V | at least 95% of the reference | FAIL |
| BUCK-STEP-01c | REQ-SETTLING | settling time back into ±2% after the step | 0.491 ms | 10 ms | at most 10 ms, and settled by the end | PASS |
| BUCK-STEP-01d | REQ-RIPPLE | LOW1 ripple, peak to peak, in the last 1 ms before the step | 24.08 mV | 100 mV | at most 100 mV | PASS |

Input hashes (SHA-256):

- `firmware/control.cpp`: `1d64665e87810556…`
- `firmware/control.h`: `c9f14ea288799025…`
- `plant/params.yaml`: `91b686f952a8f389…`
- `plant/twist_buck.py`: `ad8310906e32b873…`
- `requirements.yaml`: `24ef5d7f0daa5842…`
- `control_block (built)`: `5efdb38ac70cf723…`
