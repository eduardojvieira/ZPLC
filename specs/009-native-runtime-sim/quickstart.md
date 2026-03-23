# Quickstart: Native Runtime Simulation Parity

**Feature**: 009-native-runtime-sim | **Branch**: `009-native-runtime-sim`

---

## Prerequisites

- Bun installed and workspace dependencies available
- Zephyr environment available for hardware reference builds
- At least one serial-focused board and one network-capable board available for parity sign-off

---

## Step 1 — Run core and host-runtime tests

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/firmware/lib/zplc_core
mkdir -p build && cd build
cmake ..
ctest --output-on-failure
```

Expected outcome:

- host/runtime tests for load, status, breakpoints, stepping, forcing, and retain behavior pass

## Current Recorded Outcome

- ✅ `test_native_runtime_session` passes (lifecycle, memory, breakpoint, force flows)
- ✅ `test_hal_posix_persist` passes (retentive storage, path override, key sanitization)
- ✅ Full `ctest --output-on-failure` passes in the current host build (`test_isa`, `test_vm_core`, `test_native_runtime_session`, `test_hal_posix_persist`, `test_comm_dispatch`)

## Step 2 — Run IDE runtime tests

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun test
```

Expected outcome:

- native adapter tests pass
- capability negotiation tests pass
- debug controller tests keep hardware and local simulation on the same workflow surface

## Current Recorded Outcome

- ✅ Targeted Bun runtime tests pass for native adapter, capability negotiation, workflow parity helpers, and Electron supervisor integration
- ✅ Full `bun test` passes in `packages/zplc-ide` (191 tests, 0 failures)

## Step 3 — Compile the Electron desktop entry points

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun run electron:compile
```

Expected outcome:

- Electron main/preload entry points compile with the native simulation APIs exposed through preload

## Current Recorded Outcome

- ✅ Electron main/preload TypeScript compilation succeeded during implementation

## Step 4 — Start the desktop IDE and run a local simulation session

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun run electron:dev
```

Smoke workflow:

1. Open a reference project.
2. Compile the project.
3. Start a **Local Simulation** session.
4. Load the compiled artifact.
5. Use start, pause, resume, step, breakpoints, watch, and force operations.
6. Confirm the UI reflects capability states for any degraded or unavailable features.

## Current Recorded Outcome

- ✅ Host runtime emits `session.ready` and supports compile → load → start/status flows via stdio smoke tests
- 🔲 Full desktop smoke still reserved for the final end-to-end test pass
- ⚠️ Human desktop smoke checklist exists in `packages/zplc-ide/scripts/run-desktop-smoke.ts`, but the artifact was not launched here because no prebuilt Electron output was present and this session avoids a new build at testing time.

## Step 5 — Compare the same project against hardware

Use the existing hardware workflow in the IDE:

1. Connect to a supported controller.
2. Load the same compiled artifact.
3. Repeat the same debug sequence used in local simulation.
4. Record any mismatch in execution state, stop location, watch values, force behavior, retain behavior, or communication behavior.

Expected outcome:

- either parity matches for the declared scope, or the capability claim is downgraded explicitly

## Current Recorded Outcome

- 🔲 HIL parity is still pending and remains the blocking part of `T050`.
- ✅ The prerequisite cross-build blockers discovered during this pass were fixed before HIL resumed:
  - `firmware/app/src/zplc_config.c` compile guards and init scoping
  - `firmware/app/src/zplc_time.c` SNTP conditional compilation
  - `firmware/app/src/shell_cmds.c` scheduler helper visibility
  - `firmware/app/src/zplc_modbus.c` TCP socket-only gating
  - `firmware/app/src/zplc_modbus_client.c` RTU/TCP preprocessor structure
  - `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.conf` legacy USB stack disablement
- ⚠️ A serial-focused board target, a network-capable board target, and their live connection details are still required before parity evidence can be recorded honestly.

## Step 6 — Cross-build the firmware reference targets

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject
for BOARD in arduino_giga_r1/stm32h747xx/m7 esp32s3_devkitc nucleo_h743zi rpi_pico mps2/an385; do
  west build -b "$BOARD" $ZPLC_PATH/firmware/app --pristine
done
```

Expected outcome:

- no reference hardware targets regress while native simulation work lands

## Current Recorded Outcome

- ✅ `nucleo_h743zi` cross-build passed with an isolated Zephyr build directory.
- ✅ `mps2/an385` cross-build passed with an isolated Zephyr build directory.
- ✅ `rpi_pico/rp2040` cross-build passed with isolated build output, but still emits Zephyr USB deprecation warnings (`USB_DEVICE_DRIVER`, `USB_DEVICE_STACK`) plus non-fatal unused warnings.
- ✅ `arduino_giga_r1/stm32h747xx/m7` cross-build passed after setting `CONFIG_USB_DEVICE_STACK=n` in `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.conf`.
- ⚠️ `SNTP=y` degrades to `n` on non-network boards because `NET_SOCKETS=n` / `NETWORKING=n`; this is expected and should not be misreported as a regression.
- 🔲 `esp32s3_devkitc` was not re-run in this validation pass and should be rechecked before final T050 sign-off if the full matrix must be freshly recorded in one shot.

## Step 7 — Record parity evidence

For each reference project, capture:

- native simulation result
- hardware result
- capability scope covered
- blocking mismatches, if any
- whether the feature stays `supported`, becomes `degraded`, or remains `unavailable`

## Current Recorded Outcome

- 🔲 Cross-build evidence is now partially recorded in this quickstart, but HIL evidence is still missing.
- 🔲 `T050` must stay open until at least one serial-focused board and one network-capable board complete the parity checklist above with real captured results.

---

## Key Files for This Feature

| File | Description |
|------|-------------|
| `firmware/apps/posix_host/src/main.c` | Native simulator backend entry point |
| `firmware/lib/zplc_core/src/hal/posix/zplc_hal_posix.c` | Host HAL behavior used by native simulation |
| `packages/zplc-ide/electron/main.ts` | Electron main-process simulator supervision |
| `packages/zplc-ide/electron/preload.ts` | Safe renderer-facing simulation APIs |
| `packages/zplc-ide/src/runtime/debugAdapter.ts` | Shared runtime adapter contract |
| `packages/zplc-ide/src/runtime/nativeAdapter.ts` | Native runtime adapter |
| `packages/zplc-ide/src/hooks/useDebugController.ts` | Backend selection and debug workflow integration |
| `specs/009-native-runtime-sim/contracts/native-runtime-session.md` | Native simulator session protocol |
