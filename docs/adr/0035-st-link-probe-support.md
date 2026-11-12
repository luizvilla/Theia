---
status: proposed, deferred to a developer slice after slice 5
date: 2026-11-13
---

# ST-Link probe support for developers: flash, read timing and debug over SWD

OwnStudio flashes over USB through MCUboot and mcumgr, and the Timing check of ADR 0034 reads its report over ThingSet on the same USB link. That's enough for students. Developers of the OwnTech stack and of advanced setups need more, as Core2 showed (Core2 ADR 0005):
- a report read over SWD while the core runs, so the USB console takes no part in the measurement;
- flashing that doesn't depend on the application being alive;
- a debugger.

Luiz expects this to be needed in the long run (decision log round 22, Q13).

## Decision

- **A probe is optional equipment** of a setup, detected by USB ID (STLINK-V3 `0483:374f`, V2 `3748`, V2-1 `374b`). It shows in the Lab checklist and the Board menu only when present.
- **A preflight**, as Core2's `preflight.sh` does, checks each item and prints `OK <item>` or `MISSING <item>: <why>. Fix: <command>`. The items are: the probe, udev access on Linux, PlatformIO's OpenOCD (never a distribution copy), the MCUboot bootloader on the board, and the SWD cable. Fixes that need sudo are handed to the user, never run.
- **Flash over SWD** into the MCUboot slot (`0x8047800`), leaving the bootloader in place. It can also write the bootloader itself to a board without one.
- **Timing over SWD.** The same Timing check procedure and the same report layout as ADR 0034. Only the transport changes: the host finds the report symbol in the ELF and dumps it with OpenOCD while the core runs. The record states which transport was used.
- **Debugging** through Theia's debug adapter protocol (a Cortex-Debug-style adapter with OpenOCD): breakpoints, registers and peripheral views. It is never available while the power token is held.
- **Built in a developer slice after slice 5.** This ADR is written now so that the Timing check's report format and procedure stay transport-neutral.

## Considered options

- **USB only, for good:** blocks the developer work Core2 needed (an untouched console, flashing a board whose application is broken, debugging).
- **Leave probes to PlatformIO outside OwnStudio:** works, but the Timing check and the records would then live outside the setup's history.
- **Optional probe support, same procedures, same records:** chosen.

## Consequences

- The Timing check must not assume USB anywhere except in its transport layer (ADR 0034).
- The Lab checklist gains an optional "probe" line. Its absence is never an error.
- The safety rules don't change: debugging and SWD flashing never switch power on, and a breakpoint while the converter switches is prevented by refusing to debug while the power token is held.
