# Quickstart: Communication Function Blocks Development

**Feature**: 003-comm-fb-vm | **Branch**: `003-comm-fb-vm`

---

## Prerequisites

- Zephyr environment activated: `source ~/zephyrproject/activate.sh`
- ZPLC monorepo cloned, bun installed: `bun --version`
- For Modbus tests: a Modbus TCP simulator (e.g. `diagslave`, `modbus-sim`) or real device

---

## Step 1 — Build firmware for QEMU (fastest CI path)

```bash
cd ~/zephyrproject
west build -b mps2/an385 $ZPLC_PATH/firmware/app --pristine
# Verify no new -Werror failures:
# Build output should end with: "DONE"
```

## Step 2 — Run Core unit tests (C, host)

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/firmware/lib/zplc_core
mkdir -p build && cd build
cmake ..
make -j$(nproc)
ctest --output-on-failure
# After adding comm dispatch tests:
# Expected: "test_comm_dispatch ... Passed"
```

## Step 3 — Run compiler unit tests (TypeScript)

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-compiler
bun test
# After adding communication.test.ts:
# Expected: all tests pass including "MB_READ_HREG FB lookup" and "generateCall emits OP_COMM_EXEC"
```

## Step 4 — Run full stdlib test suite

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-compiler
bun test src/compiler/stdlib/stdlib.test.ts
```

## Step 5 — Test Modbus FB in simulation (POSIX build)

```bash
# Terminal 1: start a Modbus TCP server on port 502 (diagslave or similar)
diagslave -m tcp 502
# OR use the ZPLC POSIX runtime in loopback mode

# Terminal 2: run the POSIX runtime with a test .zplc that uses MB_READ_HREG
cd /Users/eduardo/Documents/Repos/ZPLC/firmware/apps/posix_host/build
./zplc_runtime --program test_mb_read.zplc
# Expected: DONE pulses TRUE after first successful read cycle
```

## Step 6 — Cross-compile for all CI boards

```bash
cd ~/zephyrproject
for BOARD in arduino_giga_r1/stm32h747xx/m7 esp32s3_devkitc nucleo_h743zi rpi_pico mps2/an385; do
  echo "=== Building for $BOARD ==="
  west build -b $BOARD $ZPLC_PATH/firmware/app --pristine
  echo "=== Result: $? ==="
done
```

## Step 7 — Validate IDE transpiler

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun test
# After updating fbdToST.ts / ldToST.ts:
# Expected: transpiler tests emit proper ST MB_READ_HREG(...) call, not placeholder
```

---

## Key Files for This Feature

| File                                                               | Description                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| `firmware/lib/zplc_core/include/zplc_isa.h`                        | Add `OP_COMM_EXEC`, `OP_COMM_STATUS`, `OP_COMM_RESET` |
| `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`              | New — dispatch API                                    |
| `firmware/lib/zplc_core/src/core/zplc_comm_dispatch.c`             | New — dispatch implementation                         |
| `firmware/lib/zplc_core/src/core/zplc_core.c`                      | Add opcode handlers for 0xD0–0xD2                     |
| `firmware/lib/zplc_core/tests/test_comm_dispatch.c`                | New — C unit tests                                    |
| `firmware/app/src/zplc_comm_modbus_handler.c`                      | New — Modbus FB handler                               |
| `firmware/app/src/zplc_comm_mqtt_handler.c`                        | New — MQTT FB handler                                 |
| `packages/zplc-compiler/src/compiler/stdlib/communication.ts`      | New — FB defs                                         |
| `packages/zplc-compiler/src/compiler/stdlib/index.ts`              | Register new FBs                                      |
| `packages/zplc-compiler/src/compiler/stdlib/communication.test.ts` | New — TS tests                                        |
| `packages/zplc-ide/src/editors/comm/commBlockCatalog.ts`           | New — visual catalog                                  |
| `packages/zplc-ide/src/transpiler/fbdToST.ts`                      | Replace placeholder codegen                           |
| `packages/zplc-ide/src/transpiler/ldToST.ts`                       | Replace placeholder codegen                           |
