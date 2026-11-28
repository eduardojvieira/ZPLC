# ZPLC 2.1 Milestone M6 Implementation Plan: plant I/O mode in the firmware and its evidence (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M6 builds on M1 to M4 **as merged** on `feat/plant-simulation` at commit `a2c80b32` (`Merge branch 'test/m4-q5' into feat/plant-simulation`, read with `git rev-parse` on 2026-11-13). M6 touches **no physics**: the decision D-14 gate does not affect it. Everything here is firmware C, the device link, Studio link code and evidence tooling, so no task is PHYS-adjacent. The Studio **homes** of plant I/O mode (menu action, alert dialog, status-rail indicator, "from the plant" mark in the faceplate) belong to milestone **U3** of spec 013 and are planned in `specs/013-zplc-2-1-studio-experience/plan-u3.md`, not here; this plan only names them (section "Where the Studio surfaces live") and provides what they render.

**Goal:** Deliver milestone M6 of spec 012 (spec section 6.2: "Plant I/O mode in the firmware and its evidence"): a board running the ZPLC firmware can be fed from the plant. The inputs bound in the plant map take their values from a plant link instead of the pins, the board's output image is published to the plant every exchange, the physical outputs stay in the safe state unless a person turns mirroring on, and the board leaves the mode into a documented safe state (program STOPPED, outputs safe) on exit, timeout, session end and link loss. The mode is a negotiated capability of the control link (LNK-012), is validated frame by frame (LNK-018), is counted when late (LNK-015), is admitted at deploy (LNK-013), is started by a person only (LNK-008, LNK-009), and has evidence at host, native-simulator and target-build level on this machine and at HIL level on the two learner boards through scripts the **Owner** runs (LNK-016, D-17).

**Architecture:** (1) **One new portable C99 module**, `zplc_plant.{h,c}` in `CORE/`, owns the mode: the slot tables, the validation of every frame, a staging buffer of bounded static size, the age of the last valid frame, the counters and the exit reasons. It has no Zephyr header and no allocation; its locks are hooks, as in `zplc_exchange.h`. (2) **The scan applies plant inputs through a new optional port operation**, `plant_latch_inputs`, called under the image lock **after** the pins are applied (so a bound input takes the plant's value and an unbound pin input keeps following its pin) and through the force-aware memory interface (a forced input keeps its forced value, LNK-006, RT-011). This is the "port operation for plant-fed inputs" of LNK-016. (3) **The output side of the mode lives in the one place that writes pins**, `zplc_io_write_outputs` (`CORE/src/core/zplc_sched_core.c:1007`): while the mode is active and mirroring is off it drives the digital outputs to the safe level instead of writing the image (LNK-010); the program's logical output image is untouched and is what the plant reads. (4) **The wire** is five new messages and one event of the existing framed device link, on request/response, because events are delivered by a 20 ms service tick (`APP/src/shell_cmds.c:3906`) and would add a quantum to every round trip. (5) **Studio** gains the typed link calls, a real-time plant link for a board (`IDE/src/plant/board/`) that reuses `planExchange` and `exchangeScan` unchanged (so the plant side of the exchange is the one of M1), a deploy-admission change, the capability and guard logic, and the latency qualification rule. Nothing in the physics, the scene format or the native runtime session changes.

**Tech Stack:** ANSI C99 (no dynamic allocation, no VLA, no libm), Zephyr 4.4.2 (workspace `~/zplc-zephyr-ws`, Zephyr SDK 1.0.1), CMake + ctest (host), Twister `native_sim/native/64` and `native_sim/native`, `qemu_cortex_m3`, `west build` for the seven catalogued boards, Python 3 for the bench scripts (the existing `tools/hil/zplc_tester.py` transport), TypeScript 5.9 and Bun 1.3.14 (`bun test`), React 19 only through U3. **No new dependency.**

**Spec:** `spec.md` LNK-004 to LNK-018 (section "LNK: Plant link"), decisions D-16 and D-17, the verification list of LNK, SCN-007 (the pulse each scene declares), CRS-009 (the consumer of M6, delivered in M7), section 6.2 row M6; spec 011 COM-019, COM-020, COM-023, COM-025, IO-004, IO-013, RT-011, LRN-011, LRN-015, LRN-017, LRN-018, LRN-024, LRN-026, UX-018, principles P6, P7, P9, P11; constitution rules 1, 4, 7, 9; `plan-m1.md` (the scan-exact exchange `exchangeOnce`, `planExchange`, contracts C5 to C8), `plan-m2.md` (INT and REAL signals, rules R-S1 to R-X3), `plan-m4.md` (format model); spec 013 PLS-007, PLS-008 and section 4.4; `course-outline.md` columns Tracks and A1; the run logbook `odd/tasks/zplc-2-1-0-run.md` in the main checkout.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `CORE/` is `firmware/lib/zplc_core/`; `APP/` is `firmware/app/`; `TESTS/` is `firmware/tests/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". CI typecheck is the root `bun run typecheck`. The pinned formatter formats C as well: `git add` every new file first (it only sees tracked files), then `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`) at the root. `export TMPDIR=$HOME/.cache/zplc-tmp` in every shell.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes the failing test first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". Runs **host-level C tests with its own cmake build directory** (command in Global Constraints), never `run.sh` (see rule G9). Never flashes, deploys, forces, runs or stops a device, never opens a serial port of a real board, never starts plant I/O mode against a real board: those are the Owner's (AGENTS.md guideline 8). |
| Parent | Owns git across lanes and merges in dependency order. Runs the **Zephyr evidence modes one at a time** (`native`, `native32`, `qemu-m3`, `app-native`, `size`; they share one west workspace, rule G9) after each firmware wave merge. Owns the shared files (list below). Launches the independent firmware review (Task F5) and the verifiers. Runs `format --write` after each merge batch. |
| Reviewer (independent) | Task F5 only: a fresh agent that did not write any lane F task reads the merged diff and attacks it with the Review Focus list; the native review runs under the user-owned switch (`gentle-ai review mode status`) when `review_due` is true. The firmware part does not merge to the integration branch without it (spec section 6.2 risk note, LNK "Risks and dependencies"). |
| Owner | Runs every flash, every HIL command and every physical step, with the exact commands of Task E1, on the ESP32-S3-DevKitC-1 and the Raspberry Pi Pico; commits (or hands to the parent) the evidence files they produce; answers the open questions (question 1 gates the exit rule of F1, question 3 the default timeout, question 4 the qualification rule of S5). |

**Shared files (one owner each; any other lane that needs a change asks the parent):**
`tools/contract/protocol.json` and every file generated from it, `CORE/include/zplc_plant.h`, `CORE/CMakeLists.txt`, `APP/Kconfig`/`firmware/zephyr/Kconfig` (Task F0); `CORE/src/core/zplc_sched_core.c`, `CORE/include/zplc_sched_core.h`, `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c` (F2); `CORE/src/core/zplc_proto_dev.c`, `CORE/include/zplc_proto_dev.h` (F3); `APP/src/shell_cmds.c`, `APP/prj.conf`, `APP/boards/*.conf`, `tools/firmware-test/size-budget.json` (F4); `IDE/src/runtime/link/*`, `IDE/src/runtime/framedSerialAdapter.ts` (S1); `IDE/src/runtime/connectionManager.ts` (S2); `IDE/src/i18n/catalog/plantBoard.ts` and its registration (S4); `.github/workflows/ci.yml`, `docs/sidebars.js`, `tools/hil/non-gating.json` (parent).

## Start rule
1. **Precondition A, M1 as merged.** `feat/plant-simulation` at `a2c80b32` or later. Check: `fd -t f . IDE/src/plant/session` lists `exchange.ts plantSession.ts pacing.ts`; `rg -n "exchangeScan" IDE/src/test-engine/scenePort.ts` finds `:115`; `rg -n "shortestPulseMs" IDE/src/plant/contracts.ts` finds `:14`; `fd -g scene.json IDE/plant-scenes | wc -l` is at least 17. If not, stop: the parent merges first.
2. **Precondition B, the toolchain.** On this machine: `~/zplc-zephyr-ws/.venv/bin/west --version` prints `West version: v1.5.0`; `~/zephyr-sdk-1.0.1` has `arm-zephyr-eabi`, `xtensa-espressif_esp32s3_zephyr-elf` and the host tools with QEMU; `~/zplc-zephyr-ws/zephyr/VERSION` is 4.4.2; the last full run in `~/zplc-zephyr-ws/out/summary.txt` passes host 60/60, host32 60/60, native, native32, qemu-m3 and `size 7/7`. `west` is **not on PATH** by default: `. tools/firmware-test/env.sh` puts it there. If `env.sh` fails, stop and tell the Owner.
3. **Fresh worktree** per lane: `export TMPDIR=$HOME/.cache/zplc-tmp`, `bun install`, `bun run build:compiler`, `bun run build:runtime` for lane S; nothing to install for lane F host tests (gcc, cmake and ninja are on PATH).
4. **Order.** Wave 0 (F0) alone; then the waves in the lane table. The Owner's HIL runs (wave 5) start only after the parent has merged F4 and run every Zephyr mode green on this machine.

## Evidence levels that run on this machine (state this in every report; P6)
| Level | Runs here | How | What it proves | Not proved |
|---|---|---|---|---|
| Host (core suites, ASan + UBSan, 64 and 32 bit) | Yes | `ctest` over `CORE/` (own build dir per lane) | The state machine, validation, latch, safe state, engine handlers, fuzz of the new messages | Timing, hardware |
| Native simulator (Twister `native_sim/native/64`, `native_sim/native`) and the application on a real shell (`app_device_link` style) | Yes | `tools/firmware-test/run.sh native native32` and a Python test driving `zplc link` over stdin/stdout | The real scheduler, exchange, link engine and shell on the Zephyr kernel; entry, exit, timeout, link loss by `zplc_proto_link_lost` and by silence | Real transports, real pins, real latency |
| QEMU Cortex-M3 | Yes | `run.sh qemu-m3` | The core suites on a 32-bit ARM target (not the application) | Board behaviour |
| Application on `native_sim` with the Pico channel map on `gpio_emul` | Yes | `run.sh app-native` (**emulation only**) | The pin side of the hold: outputs are driven to safe through the real HAL path with plant mode on | Hardware |
| Target build for every catalogued board | Yes | `run.sh size` (seven boards, `west build`, flash and RAM against `tools/firmware-test/size-budget.json`) | The code builds and fits on all seven boards | That it runs |
| HIL on ESP32-S3-DevKitC-1 and Raspberry Pi Pico | **No** (no `/dev/ttyACM*` or `/dev/ttyUSB*` present, and AGENTS.md rule 8) | Owner, Task E1 commands | Latency per transport, link-loss behaviour, safe pins | Other boards (D-17: they stay at target-build level) |

## Requirement mapping
Requirements that M6 does not deliver are in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| LNK-006 | F1, F2 | Plant writes use `zplc_force_write_bytes` (`CORE/include/zplc_core.h:536`): a forced input keeps its forced value. Granularity of a force of one bit is **Unconfirmed** (forces are by byte range, `:493`); F2's test pins what exists. |
| LNK-007 | F1, F2, F4, S2 | Inputs bound in the plant map take plant values; the output image is published to the plant. The program does not change. 2.0 plants feed the board from the model its lesson is graded against: the same `PlantCore` the live and graded runs use (D-19 merged), so no new model. |
| LNK-008 | S4 (guard), F3 (session rule), U3 (indicator) | Started by an explicit action of a person, per session. The firmware requires an open session (COM-020); Studio's start path is a `physical: true` command that goes through the alert dialog; it ships **disabled** until U3 lands the indicator (rule G7). |
| LNK-009 | S4 | The command is not in `AI_COMMAND_PROPOSALS`, the MCP tool list stays closed, and tests hold both (`IDE/src/mcp/hilReach.test.ts:34`, `IDE/src/mcp/deviceLink.test.ts:95`, `IDE/src/ai/proposals.ts:11-15`). Headless scene scenarios on a simulated runtime are untouched. |
| LNK-010 | F2, F4 | Hold in `zplc_io_write_outputs`; mirror is a per-session flag, off at entry, turned on by a person through `PLANT_MIRROR` (D-16). |
| LNK-011 | F1, F2, F3, F4 | Exit into STOPPED with outputs at their safe level on close, timeout, session end (idle, takeover, key change), link loss, run-control change and fault; never stale values beyond the timeout; never back to pins by itself. Rules R-M6-4 and R-M6-5. |
| LNK-012 | F0, F3, S1, S4 | Capability bit `PLANT` (0x00001000) in the hello. Firmware without it: Studio says so, with a located reason (EN, ES), and a lesson shows the hardware track unsupported with its reason (LRN-011). |
| LNK-013 | S3 | Deploy admission and the build check count an input the plant provides as provided; an input neither a pin nor the plant provides is still refused. |
| LNK-014 | S2, S5, E1 | Studio measures the round trip and the exchange gap on every frame and shows them; the worst case per transport is published as evidence by E1; Studio warns when the gap can miss the shortest declared pulse. Rule R-M6-8. |
| LNK-015 | F1, F2, S2 | The scan never waits for the link: bounded latch (at most `ZPLC_PLANT_MAX_SLOTS` slots), try-lock; a scan with no new frame since the last latch is counted `late` and visible in the response and in Studio. |
| LNK-016 | F0 to F5, E1 | C99, bounded static memory, no allocation, behind a new optional port op; proven at host, native simulator, target build (7 boards) and HIL (two boards, Owner). |
| LNK-017 | F3 (engine), F4 | USB serial: yes. TCP: **the engine is transport-agnostic and is proven on `ZPLC_PROTO_TRANSPORT_NETWORK` on the host; no Zephyr TCP transport for the device link exists** (Findings 1). Question 2. |
| LNK-018 | F1, F3 | Every frame: frame CRC (the protocol layer, `zplc_proto_link_feed_frame`), session (the gate, `zplc_proto_dev.c:1586-1600`), plant id, exact length, signal count and width, padding bits, finite REAL, sequence strictly newer. A rejected frame changes no input and does not refresh the timeout. |
| IO-004 | S3 | see LNK-013. |
| IO-013 | F2 | The new port member is optional (NULL on the FreeRTOS adapter and on single-task); the conformance cases for it run for the ports that implement it. |
| COM-019 | F0, S1 | One message set shared with the native runtime protocol: the new messages are in `tools/contract/protocol.json` and generate both the C header and `IDE/src/runtime/link/protocol.generated.ts`. |
| COM-020 | F3 | Plant mode is owned by the session: it ends with it (`end_session`, `CORE/src/core/zplc_proto_dev.c:380`) for every reason. |
| COM-023 | F1, F3 | A plant frame is applied whole, at one scan boundary. |
| COM-025 | F3, S2 | The exit is also pushed as an event (`EVT_PLANT_EXIT`); the exchange itself does not use the event queue. |
| LRN-011 | S4 | Unsupported firmware gives the reason and what to do instead. |
| LRN-015 | S4 | No Learn code path starts the mode (Learn imports `boardSession.ts` only, which has no write access, `IDE/src/runtime/boardSession.ts:1-6`); a test holds it. |
| LRN-017, LRN-018 | S2 | The mapping stays explicit; the faceplate mark is U3. |
| P6 | E1, S5, D6 | Public text states only what a recorded run at its level supports; the evidence files name their level. |
| P7, P9, P11 | F2, F3, S4 | Person-started; outputs safe; every frame validated. |
| SCN-007 | S5 | Consumed (`IDE/src/plant/contracts.ts:14`); the four 2.0 plants have no declaration (Findings 8), S5 derives one from their graded traces. |

**Not delivered by M6:** the 3D view of a board-fed scene, the faceplate mark, the indicator, the menu action and the alert dialog (U3, PLS-007, PLS-008); the hardware track of lessons, `wiring` for plant mode, the manifests of the ten 2.0 plant lessons, hardware grading on a trace recorded during a plant run, "what to connect" pages (CRS-009, CRS-010, M7, after the owner approves `course-outline.md`, CRS-001, question 5); a Zephyr TCP transport for the device link (question 2); plant I/O mode on the FreeRTOS adapter and the single-task configuration; analog outputs in the hold (no catalogued board has an analog output, checked in `firmware/app/boards/boards.json`); plant I/O on boards other than the two learner boards at HIL level (D-17).

## Contract extensions (types and rules; lanes code against these, never against each other)
Task F0 writes them into `tools/contract/protocol.json`, `CORE/include/zplc_plant.h` and `tools/contract/plant_vectors.json`. A change after F0 needs the parent: every lane depends on it.

**C-M6-1 The wire (Plan choice; the spec fixes no encoding).** Capability `PLANT` bit 12 (`0x00001000`), advertised only when the engine's ops carry `plant_enter`, `plant_frame`, `plant_exit` and `plant_mirror` (added to `capability_bit`, `CORE/src/core/zplc_proto_dev.c:82`). All five messages need an open session (access `SESSION`, so the network authentication rule of COM-021 applies unchanged). Ids are free in the table (the highest used is `0x63`).

| Message | Id | Request payload | Response payload (after the status byte) |
|---|---|---|---|
| `PLANT_ENTER` | `0x70` | `timeout_ms` u16 (50 to 2000), `n_in` u8, `n_out` u8, then `n_in` input descriptors, then `n_out` output descriptors | `plant_id` u16, `in_bytes` u16, `out_bytes` u16, `max_slots` u8, `timeout_ms` u16 (granted) |
| `PLANT_FRAME` | `0x71` | `plant_id` u16, `seq` u32, then the input values (encoding below) | `applied_seq` u32, `scans` u32, `flags` u8 (bit0 mirror, bit1 held-since-last-exchange), `late` u16, `rejected` u16, then the output values (encoding below) |
| `PLANT_EXIT` | `0x72` | empty | `reason` u8 (`CLOSED`), `frames` u32, `late` u16, `rejected` u16 |
| `PLANT_MIRROR` | `0x73` | `enable` u8 (0 or 1) | `mirror` u8 |
| `PLANT_STATUS` | `0x74` | empty | `active` u8, `plant_id` u16, `mirror` u8, `frames` u32, `late` u16, `rejected` u16, `age_ms` u16 |

A **descriptor** is 3 bytes: `offset` u16 LE (an IPI byte offset for an input, an OPI byte offset for an output) and `spec` u8 (bits 0 to 1 the type: 0 BOOL, 1 INT, 2 REAL; bits 2 to 4 the bit index, BOOL only; bits 5 to 7 zero). The **value encoding** is the same both ways: one bitmap of `ceil(n_bool / 8)` bytes holding the BOOL values in descriptor order (unused bits zero), then the INT (2 bytes, little endian, signed) and REAL (4 bytes, IEEE 754 binary32, little endian) values in descriptor order. `max_slots` is `ZPLC_PLANT_MAX_SLOTS` (default 32 per direction; Kconfig range 8 to 64); with 32 slots a frame is at most `2 + 4 + 4 + 128 = 138` bytes, inside the Pico payload of 288 (`APP/boards/rpi_pico_rp2040.conf:79`) and the default 512. The event `EVT_PLANT_EXIT` (id `136`, event mask `PLANT` = `0x00000040`) carries `reason` u8 and `frames` u32. Enum `PLANT_EXIT_REASON`: `0 CLOSED`, `1 TIMEOUT`, `2 SESSION_END`, `3 LINK_LOST`, `4 RUN_CONTROL` (STOP, RESET, program load, pause, resume of another program), `5 FAULT`, `6 PROTOCOL` (eight consecutive rejected frames).

**C-M6-2 The C module (`CORE/include/zplc_plant.h`, written by F0, implemented by F1).**
```c
#define ZPLC_PLANT_MAX_SLOTS 32U            /* per direction; CONFIG_ZPLC_PLANT_MAX_SLOTS overrides */
typedef struct { void *ctx; int (*lock)(void *ctx); void (*unlock)(void *ctx);
                 uint32_t (*now_ms)(void *ctx); } zplc_plant_hooks_t;   /* lock may fail: never wait */
void     zplc_plant_init(const zplc_plant_hooks_t *hooks);              /* inactive, counters zero */
int      zplc_plant_enter(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len); /* ZPLC_PROTO_ERR_* */
int      zplc_plant_frame(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len);
int      zplc_plant_exit(uint8_t reason);                               /* idempotent; posts the exit once */
void     zplc_plant_set_mirror(uint8_t on);
int      zplc_plant_active(void);                                       /* lock-free read */
int      zplc_plant_holds_outputs(void);                                /* active and not mirrored */
void     zplc_plant_latch(void);                                        /* scan, image lock held: apply staged inputs; bounded; never blocks */
int      zplc_plant_tick(void);                                         /* scan, after the latch: non-zero when the exit rule fired (reason kept) */
uint8_t  zplc_plant_exit_reason(void);
void     zplc_plant_get_stats(zplc_plant_stats_t *out);                 /* frames, rejected, late, applied_seq, age_ms */
```
Rules the module keeps (each has a named test in F1):
- **R-M6-1 Entry.** Refused with `ZPLC_PROTO_ERR_STATE` when already active; with `ERR_BAD_REQUEST` when `n_in` or `n_out` exceeds `ZPLC_PLANT_MAX_SLOTS`, a reserved bit is set, a descriptor type is unknown or the lengths do not add up; with `ERR_RANGE` when an input lies outside IPI or in the system register area (`IDE/src/boards/boardIo.ts:64`, `SYSTEM_REGISTER_OFFSET = 0x0ff0`), an output lies outside OPI, or two slots of one direction overlap (a numeric slot owns all its bytes, as `planExchange` requires, `IDE/src/plant/session/exchange.ts`). The runtime must be RUNNING (the adapter checks, F2): entering a stopped or paused runtime is `ERR_STATE`. Mirror is off at entry.
- **R-M6-2 Frame validation, in this order** (LNK-018): active; `plant_id` equals the current entry's; payload length is exactly `6 + in_bytes` (plant id, sequence, then the value bytes the entry fixed); padding bits of the bitmap are zero; every REAL is finite; `seq` is newer than the last accepted by a wrap-aware 32-bit difference in `1 .. 2^31 - 1`. A frame that fails any check changes **no** staged value, does **not** refresh the age, increments `rejected`, and answers `ERR_BAD_REQUEST`. Eight rejected frames in a row exit with `PROTOCOL`.
- **R-M6-3 Latch.** At the scan's input latch, under the image lock, `zplc_plant_latch` takes the plant lock with a **try**: on failure the scan goes on with the values already in the image and counts `late`; on success it applies each staged slot once (BOOL: read the byte, set or clear the bit, `zplc_force_write_bytes` of that byte; INT and REAL: `zplc_force_write_bytes` of the little-endian bytes) and marks the staging consumed. A latch with nothing new counts `late` (the previous values persist, bounded by R-M6-4). Work per scan is at most `2 * ZPLC_PLANT_MAX_SLOTS` byte writes.
- **R-M6-4 Staleness bound.** `age_ms` is the time since the last accepted frame. When it exceeds the granted `timeout_ms`, `zplc_plant_tick` returns non-zero with reason `TIMEOUT`. The values in the image can therefore be at most `timeout_ms + one scan` old (documented, tested, published). `timeout_ms` is clamped to 50 .. 2000 at entry; the default Studio asks for is question 3.
- **R-M6-5 Exit is one rule.** Every reason (including a person's `PLANT_EXIT`, question 1) does the same: the module becomes inactive; the adapter, after the scan has released its locks, drives the pins safe (`zplc_io_drive_safe`) and **stops the scheduler through the path of the STOP command** (outputs safe, image reset, forces cleared, RT-017). The mode never re-enables pin inputs on a running program. The event is pushed once with the reason. A person starts the program again with RUN, which starts in pin mode.
- **R-M6-6 Hold.** While `zplc_plant_holds_outputs()` is true, `zplc_io_write_outputs` writes the safe level of every digital output (the declared safe level of the program, else the board's `safe`, as `zplc_io_drive_safe`, `CORE/src/core/zplc_sched_core.c:1033`) and skips analog outputs (none exist on the catalogue). From the instant the exit rule fires, the hold is unconditional, mirror or not. Turning mirror on changes no image byte and no force.
- **R-M6-7 Snapshot.** The `PLANT_FRAME` response encodes the outputs from the exchange snapshot published at the last commit (`zplc_exchange_read_lock`/`read_locked`, `CORE/include/zplc_exchange.h`), so all outputs of one response are of one scan (LNK-003). `applied_seq` is the last `seq` a scan latched before that commit.
- **R-M6-8 Latency and qualification (Studio).** For each exchange Studio records `rtt_ms` (send to response) and `gap_ms` (between consecutive responses). For a transport, `worstGapMs` is the maximum of `gap_ms` over the evidence run. A scene is safe for the hardware track on that transport when `shortestPulseMs >= worstGapMs + scanMs` (Plan choice: a pulse shorter than the worst gap between two exchanges can fall between two frames, and one scan of margin covers the latch). Live, Studio warns when the rolling worst gap of the last 200 exchanges breaks that rule for the scene being run.

**C-M6-3 The Studio link port (`IDE/src/plant/board/boardPlantLink.ts`, written by S2; consumed by U3).**
```ts
export type PlantIoPhase = 'unsupported' | 'idle' | 'entering' | 'active' | 'leaving' | 'left';
export interface PlantIoSnapshot {
  phase: PlantIoPhase;
  reason?: PlantExitReason;           // when phase is 'left'
  unsupported?: { en: string; es: string };   // when phase is 'unsupported' (LNK-012, LRN-011)
  mirror: boolean;
  rttMs: { last: number; p50: number; p95: number; max: number };
  gapMs: { last: number; worst: number };     // rolling window of 200
  late: number; rejected: number; frames: number;
  pulseWarning?: { sceneMs: number; worstGapMs: number; scanMs: number };  // LNK-014
}
export interface PlantIoController {
  readonly snapshot: () => PlantIoSnapshot;
  readonly subscribe: (listener: () => void) => () => void;   // useSyncExternalStore-ready (U3 renders it)
  start(): Promise<void>;            // only a person's command calls this (rule G7)
  setMirror(on: boolean): Promise<void>;
  stop(): Promise<void>;
}
export function createPlantIoController(ports: { link: PlantBoardPort; core: PlantCore; map: PlantMapV2; ioMap: IoMap;
  scanMs: number; frameMs: number; timeoutMs: number; now?: () => number; pace?: (ms: number) => Promise<void> }): PlantIoController;
```
`PlantBoardPort` is the narrow view of the single link owner (COM-025): `supported(): boolean`, `enter`, `frame`, `exit`, `mirror`, `onExit(listener)`. The real implementation is added to `FramedSerialAdapter` by S1 (`framedSerialAdapter.ts:49` holds the `DeviceLink`; `ask` and `changing` at `:222`, `:229` are the access discipline).

**C-M6-4 The five Studio-visible i18n keys** (S4 creates them in `IDE/src/i18n/catalog/plantBoard.ts`, EN and ES; S2 and U3 use them): `plantIo.unsupported.firmware`, `plantIo.unsupported.reason.noCapability`, `plantIo.exit.<reason>` (one per `PLANT_EXIT_REASON`), `plantIo.warn.pulse`, `plantIo.confirm.body`.

## Lanes and dependency graph
**KEEP** = survives any change of decision D-14 (all of M6 is KEEP). **FW** = firmware, C. **STU** = Studio, TypeScript. **OWN** = needs the Owner.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| F | F0 | Foundation: protocol definition, generated files, header, stubs, CMake registration, Kconfig symbol, vectors | FW, KEEP | M1 | `tools/contract/protocol.json` (+ generated), `CORE/include/zplc_plant.h`, `CORE/src/core/zplc_plant.c` (stub), `CORE/CMakeLists.txt`, `firmware/zephyr/Kconfig`, `tools/contract/plant_vectors.json` |
| F | F1 | The plant module: validation, staging, latch, timeout, exit rule | FW, KEEP | F0 | `CORE/src/core/zplc_plant.c`, `CORE/tests/test_plant.c` |
| F | F2 | Scheduler integration: port op, hold in `zplc_io_write_outputs`, exit after the scan, Zephyr adapter | FW, KEEP | F1 | `CORE/src/core/zplc_sched_core.{c,h}`, `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c`, `CORE/tests/test_plant_sched.c` |
| F | F3 | Link engine: handlers, ops, capability, session and link-loss hooks, fuzz | FW, KEEP | F0 | `CORE/src/core/zplc_proto_dev.c`, `CORE/include/zplc_proto_dev.h`, `CORE/tests/test_proto_plant.c`, `CORE/tests/fuzz_proto_link.c` |
| F | F4 | Application wiring, Twister test, application link test, size, board configs | FW, KEEP | F1, F2, F3 | `APP/src/shell_cmds.c`, `APP/prj.conf`, `APP/boards/*.conf`, `TESTS/plant_io/**`, `TESTS/app_plant_link/**`, `tools/firmware-test/size-budget.json` |
| F | F5 | Independent firmware review and attack tests | FW review | F4 | no source edits except the failing tests it adds in `CORE/tests/test_plant_attack.c` |
| E | E1 | HIL bench script, evidence format, validator, native-simulator rehearsal | FW tooling, KEEP | F0 (wire), F4 for the rehearsal | `tools/hil/plant_io_bench.py`, `tools/hil/validate_plant_io_evidence.py`, `tools/hil/test_plant_io_bench.py`, `specs/012-zplc-2-1-plant-simulation/evidence/plant-io.schema.json` |
| S | S1 | Typed link calls and the capability in Studio | STU, KEEP | F0 | `IDE/src/runtime/link/deviceLink.ts`, `IDE/src/runtime/framedSerialAdapter.ts` and their tests |
| S | S2 | The board plant link: real-time loop, latency, controller | STU, KEEP | S1 | `IDE/src/plant/board/**`, `IDE/src/runtime/connectionManager.ts` |
| S | S3 | Deploy admission and build check count plant-fed inputs | STU, KEEP | F0 | `IDE/src/boards/ioAdmission.ts`, `IDE/src/runtime/deviceHandshake.ts` and their tests |
| S | S4 | Command, guards, capability reason, strings | STU, KEEP | F0 | `IDE/src/commands/registry.ts`, `IDE/src/i18n/catalog/plantBoard.ts`, `IDE/src/plant/board/support.ts`, `IDE/src/mcp/*.test.ts`, `IDE/src/ai/proposals.test.ts` |
| S | S5 | Qualification rule and the pulse of the four 2.0 plants | STU, KEEP | S2 | `IDE/src/plant/board/qualify.ts`, `IDE/src/plants/plantPulses.ts` and tests |
| D | D6 | Documentation in English and Spanish | docs, KEEP | F3, S2 | `docs/docs/**/plant-io*.md`, Spanish twins, `docs/docs/reference` generated pages |
| V | V7 | Evidence run on this machine (parent) | evidence | F4, F5, S2 | `specs/012-zplc-2-1-plant-simulation/evidence/m6-linux-x64.json` |
| H | H8 | HIL runs on ESP32-S3 and Pico | OWN | V7, E1 | `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-<board>-<transport>.json` |
| C | C6 | Requirement coverage for the M6 requirements | KEEP | all | `tools/ci/requirement-coverage*` data, `IDE/src/plant/ci/` index for 012 |

## Parallel waves
| Wave | Tasks (parallel, disjoint surfaces) | Gate before the next wave |
|---|---|---|
| 0 | F0 (parent or one writer) | `bun run typecheck` at the root, host ctest of the stubs builds, generated files unchanged on a second generator run |
| 1 | F1, F3, S1, S3, S4, E1 (wire part) | Each lane's own tests; parent merges, runs the full `ctest`, one `bun test` of `IDE/` |
| 2 | F2, S2 | Host ctest (64 and 32 bit sanitized); parent runs `run.sh native` |
| 3 | F4, S5, D6 | Parent runs `run.sh native32 qemu-m3 app-native size` serially, one at a time |
| 4 | F5 (independent), V7 (parent), C6 | F5 blockers fixed once, rechecked once (the correction bound of the orchestrator contract) |
| 5 | H8 (Owner) | Evidence files validated by `validate_plant_io_evidence.py`; S5's table regenerated from them |

## Global Constraints
- **G1, language and memory.** Plant code is ANSI C99: no allocation (`malloc`, `calloc`, `realloc`, VLAs, `alloca`), no libm, no `float` arithmetic in the module (REAL values are copied as 4 bytes and checked finite by their exponent bits, `(bits & 0x7F800000) != 0x7F800000`), static storage sized by `ZPLC_PLANT_MAX_SLOTS`, every loop bounded by a constant. `clang-tidy` clean (`run.sh tidy`, run by the parent when clang-tidy exists).
- **G2, nothing blocks the scan.** The scan takes the plant lock with a try and works for a bounded number of bytes (R-M6-3). The link thread never takes the image lock while holding the plant lock; lock order everywhere: image lock, then plant lock (the exchange's rule, `zplc_exchange.h:20-24`, extended).
- **G3, safe by default.** Every new path that can fail ends in the safe state, never in pin inputs (P9, constitution rule 4). A test for each exit reason checks image reset, safe pins, state STOPPED and that no scan runs with plant values after the exit.
- **G4, validate at the boundary.** No plant value reaches the image before every check of R-M6-2 passed (P11, LNK-018). Every new message is added to the fuzz harness (`CORE/tests/fuzz_proto_link.c`).
- **G5, tests are behavioural (VF-006).** Each test goes through the public interface (the engine's frames, the scheduler port, the exported TS functions) and asserts every observable effect: response bytes, image bytes, pin writes, state, counters, events. No test asserts a source string.
- **G6, CI and format.** Root `bun run typecheck`; `bun run lint` and `bun test` in `IDE/` for lane S; the pinned formatter (see header) for C and TS; `python3 tools/hil/test_hil_scripts.py` keeps `tools/hil/non-gating.json`, `README.md` and the directory in agreement (E1).
- **G7, a person starts it.** `PlantIoController.start` is reachable only from the registry command `online.feedBoardFromPlant` (`physical: true`) after `confirmAction` (UX-020). The command ships `enabled: () => false` in M6 and U3 enables it in the same commit that mounts the indicator; a test in S4 holds that no state of the registry enables it while the indicator is absent (LNK-008). The HIL script of E1 refuses to run unless a TTY is attached and the person types the board id, which is the explicit action on the bench.
- **G8, AI and MCP.** None of them can reach a function that opens a plant entry: no new MCP tool, no new proposal, no new command in the allow lists; S4 tests the three lists against the registry.
- **G9, one west workspace.** `tools/firmware-test/run.sh` re-points `~/zplc-zephyr-ws/zplc` at the checkout that runs it (`run.sh:101-103`) and writes `~/zplc-zephyr-ws/out`; two lanes running `native`, `native32`, `qemu-m3`, `app-native` or `size` at the same time break each other. **Only the parent runs those modes, one at a time.** Writers run host tests in their own build directory:
  `cmake -S firmware/lib/zplc_core -B $TMPDIR/m6-<task>-build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="-fsanitize=address,undefined,float-cast-overflow -fno-sanitize-recover=undefined,float-cast-overflow -fno-omit-frame-pointer" && cmake --build $TMPDIR/m6-<task>-build --parallel && ASAN_OPTIONS=detect_leaks=1 UBSAN_OPTIONS=halt_on_error=1 ctest --test-dir $TMPDIR/m6-<task>-build -R "<test>" --output-on-failure`
  (the flags are those of `run_host`, `tools/firmware-test/run.sh:146-156`).
- **G10, evidence honesty.** A host, native-simulator, QEMU, size or emulation result is never called hardware evidence. Evidence files carry `"level"` (`host`, `native-sim`, `qemu`, `target-build`, `hil`), the commit, the tool versions and the date. Nothing in public text says a board "supports" plant I/O until a `hil` file for it exists (P6).
- **G11, docs in two languages.** Every new or changed page exists in `docs/docs/` and `docs/i18n/es/docusaurus-plugin-content-docs/current/` in the same commit; the generated runtime reference is regenerated by its generator, not edited.
- **G12, size budgets.** `tools/firmware-test/size-budget.json` carries the rule: a change that raises a size past its budget raises the budget in the same commit with the reason. The Pico has the least room (measured 177848 flash and 173424 RAM, budget 186880 and 182272, so 9032 and 8850 bytes of headroom); F4 measures the delta of plant I/O on every board and records it. Plant I/O is a Kconfig option (`CONFIG_ZPLC_PLANT_IO`, default `y` when `CONFIG_ZPLC_DEVICE_LINK` is `y`) so a board with no room can turn it off and then does not advertise the capability.
- **G13, commits.** Conventional Commits, no AI attribution, one work unit per commit with its tests and docs.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A forced input keeps its forced value while a plant frame arrives for it (LNK-006). F2 `plant_sched_forced_input_wins`.
2. A bound input takes the plant value over the pin in the same scan; an unbound pin input still follows its pin (LNK-007). F2 `plant_sched_bound_input_overrides_pin_unbound_follows_pin`.
3. All values of one frame appear in one scan, never half (LNK-003). F2 `plant_sched_frame_applies_whole_at_one_latch` (scanner on a thread, reader on another, as `test_exchange.c:274`).
4. Outputs are safe while in the mode and mirror is off; the image still carries the program's outputs and the plant sees them (LNK-010, R-M6-6, R-M6-7). F2 `plant_sched_pins_safe_image_published`; F4 `plant_io.hold_on_gpio_emul`.
5. Every exit reason stops the program in the safe state and nothing resumes by itself (LNK-011, R-M6-5). F2 `plant_exit_reason_<each>_stops_safe`; F3 `proto_plant_session_end_exits`, `proto_plant_link_lost_exits`; F4 `app_plant_link: silence times out`.
6. The staleness bound is `timeout_ms + one scan` and a test measures it (R-M6-4). F1 `plant_tick_timeout_bound`.
7. A damaged, replayed, out-of-order, wrong-id, wrong-length, NaN, padding-bit or oversized frame changes no input and does not refresh the timeout (LNK-018). F1 `plant_frame_rejects_*` (one test per rule), F3 fuzz.
8. The scan is never delayed by the link: the latch with the lock held by the link thread completes and counts `late` (LNK-015). F1 `plant_latch_trylock_never_blocks`.
9. Firmware without the capability is detected and explained (LNK-012). S1 `capability absent`, S4 `unsupported reason in both languages`.
10. A deploy that needs an input the plant provides is admitted; one that needs an input nothing provides is refused (LNK-013). S3.
11. No AI or MCP path reaches the mode and the command is disabled without the indicator (LNK-008, LNK-009). S4.
12. The latency rule warns when the worst gap can miss the scene's pulse (LNK-014). S2 `pulse warning`, S5 `qualify`.
13. Plant mode off changes nothing: with the capability compiled out or the mode inactive, every existing suite (60 host, 27 QEMU, the application link test) passes unchanged and the hello of a build without it carries no new bit. F2/F3/F4 regression runs.

## Task F0: Foundation: wire, header, stubs, registration (wave 0, alone)
**Spec:** LNK-012, LNK-016, COM-019. **Allowed edit surfaces:**
```
tools/contract/protocol.json
tools/contract/plant_vectors.json
tools/contract/generate_protocol.py
CORE/include/zplc_proto_defs.h
CORE/include/zplc_plant.h
CORE/src/core/zplc_plant.c
CORE/CMakeLists.txt
firmware/zephyr/Kconfig
IDE/src/runtime/link/protocol.generated.ts
docs/docs/reference/runtime-api.md
docs/i18n/es/docusaurus-plugin-content-docs/current/reference/runtime-api.md
tools/docs/generate_runtime_reference.py
```
The generated files change only through the generators. **Steps:**
- [ ] Add capability `PLANT` (bit 12), enum `PLANT_EXIT_REASON`, event mask `PLANT`, messages `PLANT_ENTER` to `PLANT_STATUS` and event `EVT_PLANT_EXIT` to `protocol.json` exactly as C-M6-1, with the EN and ES `doc` fields the file's schema requires. Read the neighbouring entries (`FORCE_SET`, `KEEPALIVE`, `EVT_STATUS`) first and copy their shape.
- [ ] Run `python3 tools/contract/generate_protocol.py` and the runtime-reference generator (`python3 tools/docs/generate_runtime_reference.py`; its exact invocation is in `package.json` scripts, **Unconfirmed**: read it first). Commit the regenerated `zplc_proto_defs.h`, `protocol.generated.ts` and the two reference pages.
- [ ] Write `zplc_plant.h` (C-M6-2) and a `zplc_plant.c` whose functions return `ZPLC_PROTO_ERR_UNSUPPORTED` or do nothing, so lanes link against it. Add `CONFIG_ZPLC_PLANT_IO` and `CONFIG_ZPLC_PLANT_MAX_SLOTS` to `firmware/zephyr/Kconfig` next to `ZPLC_DEVICE_LINK` (`:155`).
- [ ] In `CORE/CMakeLists.txt` register three tests that already exist as empty `main` files returning 0: `test_plant`, `test_plant_sched`, `test_proto_plant` (the blocks of `test_sched_core`, `:465-487`, are the model; the real tests replace the empty files in F1, F2 and F3, so no lane edits CMake).
- [ ] Write `plant_vectors.json`: byte-exact **payloads** (not frames, so no CRC) for one entry with 3 BOOL, 1 INT, 1 REAL inputs and 2 BOOL outputs, its response, one frame, its response, an exit, a mirror and the event, each with its `name`. Compute them by hand from C-M6-1 and write the computation in a `comment` field. F1 and S1 both test against this file.
- [ ] Run: second generator run leaves `git status` clean; `bun run typecheck` at the root; the host build of `CORE/` compiles with the three stub tests (G9 command, `-R "test_plant|test_plant_sched|test_proto_plant"`).
- [ ] Commit `feat(contract): define the plant I/O mode messages of the device link`.

## Task F1: The plant module (wave 1)
**Spec:** LNK-006, LNK-011, LNK-015, LNK-018, R-M6-1 to R-M6-5, R-M6-7. **Depends on:** F0. **Allowed edit surfaces:**
```
CORE/src/core/zplc_plant.c
CORE/tests/test_plant.c
```
**Failing tests first (named, in `test_plant.c`, driven through `zplc_plant_enter`, `zplc_plant_frame`, `zplc_plant_latch`, `zplc_plant_tick`, `zplc_plant_get_stats` and the core memory API, with a fake clock):** `plant_enter_accepts_the_vector`, `plant_enter_rejects_too_many_slots`, `plant_enter_rejects_input_in_system_registers`, `plant_enter_rejects_overlapping_numeric_slots`, `plant_enter_rejects_reserved_bits`, `plant_enter_refused_when_active`, `plant_frame_applies_vector_values_at_the_latch`, `plant_frame_rejects_wrong_plant_id`, `plant_frame_rejects_wrong_length`, `plant_frame_rejects_padding_bits`, `plant_frame_rejects_nan_and_infinity`, `plant_frame_rejects_replayed_and_old_seq`, `plant_frame_seq_wraps`, `plant_rejected_frame_changes_nothing_and_does_not_refresh_age`, `plant_eight_rejects_exit_protocol`, `plant_latch_forced_byte_keeps_forced_value`, `plant_latch_bool_keeps_neighbour_bits`, `plant_latch_trylock_never_blocks`, `plant_latch_nothing_new_counts_late`, `plant_tick_timeout_bound` (a 100 ms timeout fires after more than 100 ms and not before, with the age in the stats), `plant_exit_is_idempotent_and_posts_once`, `plant_response_outputs_come_from_one_snapshot`.
- [ ] Write the tests; run the G9 command with `-R test_plant`; paste the failure into the commit body (RED).
- [ ] Implement the module to the rules; static arrays only; REAL finite check by exponent bits; locks through the hooks with try semantics.
- [ ] Run the same command (GREEN), then the whole host suite once in the lane's build directory; run the 32-bit variant once (`-m32` added to `CMAKE_C_FLAGS` in a second build directory; needs `gcc-multilib`, which this machine has: `/usr/lib32/libc.so` exists).
- [ ] Commit `feat(core): add the plant I/O mode module`.

## Task F3: Link engine: handlers, capability, session hooks, fuzz (wave 1)
**Spec:** LNK-012, LNK-017 (engine), LNK-018, COM-019, COM-020, COM-025. **Depends on:** F0. **Allowed edit surfaces:**
```
CORE/src/core/zplc_proto_dev.c
CORE/include/zplc_proto_dev.h
CORE/tests/test_proto_plant.c
CORE/tests/fuzz_proto_link.c
```
**Design:** add `plant_enter`, `plant_frame`, `plant_exit`, `plant_mirror`, `plant_status` members to `zplc_proto_ops_t` (`zplc_proto_dev.h`, next to `:178`), a `case ZPLC_PROTO_CAP_PLANT` in `capability_bit` (`:82`) that is true only when the four mandatory members are non-NULL, one handler per message in `dispatch` (`:1408`), and a call to `ops->plant_exit(ctx, SESSION_END or LINK_LOST)` inside `end_session` (`:380`, before the forces are released) so every session ending reaches the mode (idle `:1870`, close, takeover, key change, `zplc_proto_link_lost` `:1686-1700`). The engine does not interpret slots: it passes the payload to the ops (the module validates, R-M6-2); it only enforces the session and the length floor. A missing op answers `ERR_UNSUPPORTED` and the bit is absent from the hello.
**Failing tests (`test_proto_plant.c`, a fake ops table recording calls, frames through `zplc_proto_link_feed_frame`):** `proto_plant_capability_absent_without_ops` (hello has no bit 12 and the five ids answer `UNSUPPORTED`), `proto_plant_capability_present_with_ops`, `proto_plant_needs_a_session` (no session: `NO_SESSION` for all five), `proto_plant_enter_frame_exit_roundtrip_matches_the_vectors` (payloads of `plant_vectors.json`), `proto_plant_session_close_exits_with_session_end`, `proto_plant_idle_timeout_exits`, `proto_plant_takeover_exits`, `proto_plant_link_lost_exits_with_link_lost`, `proto_plant_exit_event_is_pushed_once_with_the_reason`, `proto_plant_frame_counts_as_session_activity` (a stream of frames keeps an idle session alive), `proto_plant_network_transport_requires_authentication` (a `ZPLC_PROTO_TRANSPORT_NETWORK` link without the auth code is refused; with it, the round trip works: the engine-level proof of LNK-017's TCP half), `proto_plant_bad_length_is_bad_request`. Extend the fuzz harness `ops` (`fuzz_proto_link.c:201-238`) with the plant ops and add the five ids to its message set; run it for the project's usual iteration count (**Unconfirmed**: read the file's header for how CI runs it).
- [ ] RED, implement, GREEN with the G9 command (`-R "test_proto_plant|test_proto_session|fuzz_proto"`), then the full host suite once; commit `feat(core): serve the plant I/O messages in the device link engine`.

## Task S1: Typed link calls and the capability in Studio (wave 1)
**Spec:** LNK-012, COM-019, COM-025. **Depends on:** F0 (generated `MESSAGES` and `CAPABILITY`). **Allowed edit surfaces:**
```
IDE/src/runtime/link/deviceLink.ts
IDE/src/runtime/link/deviceLink.plant.test.ts
IDE/src/runtime/framedSerialAdapter.ts
IDE/src/runtime/framedSerialAdapter.plant.test.ts
IDE/src/runtime/link/eventRouter.ts
```
**Steps / failing tests:** `deviceLink plant: hello with bit 12 has('PLANT') is true and without is false`; `plantEnter, plantFrame, plantExit, plantMirror, plantStatus encode the payloads of plant_vectors.json byte for byte and decode the responses`; `an ERR_BAD_REQUEST frame response raises LinkError with the error name` (existing class, `deviceLink.ts:37`); `EVT_PLANT_EXIT reaches the listener once with the reason` (router, `eventRouter.ts`); `FramedSerialAdapter.plantBoardPort().supported() is false for a text-shell firmware and for a framed firmware without the bit`; `the port methods go through the adapter's ask/changing discipline (a frame in flight is not interleaved with another request)`.
- [ ] RED (`bun test src/runtime/link/deviceLink.plant.test.ts src/runtime/framedSerialAdapter.plant.test.ts` in `IDE/`), implement the methods with `encodeRequest`/`decodeResponse` (`messages.ts:118,139`), expose `plantBoardPort()` implementing `PlantBoardPort` (C-M6-3; the interface is declared in `IDE/src/plant/board/portTypes.ts`, which S1 creates and S2 imports), GREEN, `bunx tsc -b`, `bun run lint`; commit `feat(runtime): add the plant I/O calls to the device link`.

## Task S3: Deploy admission and the build check count plant-fed inputs (wave 1)
**Spec:** LNK-013, IO-004, IO-003. **Depends on:** F0. **Allowed edit surfaces:**
```
IDE/src/boards/ioAdmission.ts
IDE/src/boards/ioAdmission.plant.test.ts
IDE/src/runtime/deviceHandshake.ts
IDE/src/runtime/deviceHandshake.plant.test.ts
```
**Design:** `checkProgramIo` (`ioAdmission.ts:59`) and `checkLocatedVariables` (`:128`, which already has an exempt `virtualAddresses` set) gain an optional `plantProvided: readonly { region: 'I'; byte: number; width: number; bit?: number }[]`. An input byte a plant slot covers counts as covered, **only for inputs**: an output the board has no channel for is still refused, and the plant never provides an output byte. `deviceHandshake.ts:310` receives the list from the map the project has (`planExchange(...).sensors` gives it, `exchange.ts`); when the project has no plant map the call is as today. The list is the **project's** plant map, not a promise that the mode is on: admission says the program can run when fed, and the mode itself is a person's action later (LNK-008). The deploy dialog text states which inputs come from the plant (U3 renders it; S3 only exposes the list in the admission result).
**Failing tests:** `an input the plant provides and no pin covers is admitted` (the lesson case: seven inputs read, four channels, `IDE/lessons/conveyor-classification-jam/lesson.json:14`), `an input neither a pin nor the plant provides is still refused with ZPLC_DEVICE_PROGRAM_IO_MISMATCH and the address named`, `an output with no channel is refused even when a plant map exists`, `a plant slot covering part of a word leaves the other byte refused`, `no plant map: the result is byte-identical to before` (the previous behaviour test for the touched function), `located variable on a plant-provided input is not an error`.
- [ ] RED, implement, GREEN (`bun test src/boards src/runtime/deviceHandshake`), `bunx tsc -b`; commit `feat(boards): count plant-fed inputs as provided at deploy admission`.

## Task S4: Command, guards, capability reason, strings (wave 1)
**Spec:** LNK-008, LNK-009, LNK-012, LRN-011, LRN-015, UX-020. **Depends on:** F0. **Allowed edit surfaces:**
```
IDE/src/commands/registry.ts
IDE/src/commands/registry.plant.test.ts
IDE/src/i18n/catalog/plantBoard.ts
IDE/src/i18n/catalog/index.ts
IDE/src/plant/board/support.ts
IDE/src/plant/board/support.test.ts
IDE/src/mcp/hilReach.test.ts
IDE/src/mcp/deviceLink.test.ts
IDE/src/ai/proposals.test.ts
IDE/src/learn/learnPhysical.test.tsx
```
(`index.ts` of the catalog is **Unconfirmed**: read how `plantView.ts` is registered and edit that one file.) **Design:** register `online.feedBoardFromPlant` (`physical: true`, `category: 'online'`, `enabled: () => false` with a comment naming U3) next to `online.connect` (`registry.ts:111-118`); `support.ts` exports `plantIoSupport(info)` returning `{ supported: true }` or `{ supported: false, reason: { en, es } }` for a text-shell firmware, a framed firmware without the bit, and a board without a description; strings per C-M6-4 in both languages (Spanish with the register of the existing catalogue).
**Failing tests:** `the command is physical and disabled in every registry state` (loop over the states the registry test already builds), `no AI proposal can name it` (`AI_COMMAND_PROPOSALS` values and the commands the existing test holds as non-physical), `the MCP tool list names no plant tool` (extends the regex of `hilReach.test.ts:52` with `plant|feed|mirror`), `the Learn modules cannot import the controller` (the import-graph style check of `learnPhysical.test.tsx`), `unsupported reasons exist in English and Spanish and name what to do instead (a firmware update)`, `i18n parity of the new keys`.
- [ ] RED, implement, GREEN (`bun test src/commands src/mcp src/ai src/plant/board src/learn/learnPhysical.test.tsx src/i18n`), `bunx tsc -b`, `bun run lint`; commit `feat(plant): add the physical command and the capability reason for plant I/O mode`.

## Task E1: HIL bench script, evidence format and validator (wave 1; the rehearsal part waits for F4)
**Spec:** LNK-014, LNK-016, LNK-011 evidence, HIL scripts policy (`tools/hil/non-gating.json`, HIL-004). **Depends on:** F0 (wire). **Allowed edit surfaces:**
```
tools/hil/plant_io_bench.py
tools/hil/validate_plant_io_evidence.py
tools/hil/test_plant_io_bench.py
tools/hil/README.md
specs/012-zplc-2-1-plant-simulation/evidence/plant-io.schema.json
specs/012-zplc-2-1-plant-simulation/evidence/plant-io-example.json
```
The parent edits `tools/hil/non-gating.json`. **What the script does (Plan choice):** `plant_io_bench.py --board <ide_id> --transport usb-serial --frames 5000 --frame-ms 20 --out <file>` is run **by a person at the bench**. It refuses to start unless stdin is a TTY and the person types the board id (G7); it opens the port with `ZPLCTester` (`tools/hil/zplc_tester.py:112`, which already resolves the port from the USB identifiers), speaks the framed link through `zplc link` lines like Studio (`shellTransport.ts`), opens a session, enters plant mode with a fixed synthetic map (4 BOOL inputs, 2 BOOL outputs, 1 INT, 1 REAL), streams frames with a deterministic pattern while a loaded test program echoes inputs to outputs, and records: `rtt_ms` and `gap_ms` per frame (p50, p95, p99, max), `late`, `rejected`, `applied_seq` continuity, then **three physical sequences, each announced and confirmed by the person at the keyboard**: (1) mirror off: the person confirms the board's LED stays off while the program's outputs toggle (read back from the response); (2) mirror on: the person confirms the LED follows; (3) link loss: the person unplugs the cable, waits ten seconds, plugs it back, and the script reads `zplc status` and the output image: expected STOPPED and image reset; the person confirms the LED is off. The evidence file has `level: "hil"`, board, transport, firmware commit and version (`zplc version` output), date, tool versions, the measurements, the three person confirmations (`confirmed_by: "person"`) and nothing else. **The script never flashes, never deploys on its own (the person runs the documented deploy command first and the script verifies the loaded program's CRC before it starts), and never runs a second time without a new confirmation.**
**Failing tests (`test_plant_io_bench.py`, no hardware: the existing fake transport `ZPLC_HIL_DEVICE` and a Python fake of the engine built from `plant_vectors.json`):** `refuses without a tty`, `refuses when the typed board id differs`, `computes percentiles and the worst gap on a scripted trace`, `evidence file validates against plant-io.schema.json`, `a trace with a gap above the limit makes the validator exit 1`, `a file with level other than hil is refused by validate_plant_io_evidence.py --level hil`, `the three confirmations are required`. The **rehearsal** (after F4, by the parent): run the script against `native_sim` through `tools/hil/emulator/native_sim.py` and commit the result as `evidence/plant-io-native-sim-rehearsal.json` with `level: "native-sim"`; it checks that script, schema and firmware agree and says nothing about hardware.
- [ ] RED, implement, GREEN (`python3 -m pytest tools/hil/test_plant_io_bench.py tools/hil/test_hil_scripts.py` or the repo's runner, **Unconfirmed**: read `tools/hil/README.md`), commit `feat(hil): add the plant I/O bench script and its evidence format`.
- **Exact commands the Owner runs (wave 5, Task H8; documented in `tools/hil/README.md` by this task):** build and flash the HIL firmware for the board per the board's documented command (`firmware/app/boards/boards.json` field `build_command`; the Owner follows `docs/docs/development/firmware-testing.md` for flashing), deploy the program `tools/hil/blinky_ld_gen.st`-style echo program the README names, then `python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --frames 5000 --frame-ms 20 --out specs/012-zplc-2-1-plant-simulation/evidence/plant-io-esp32s3-usb-serial.json` and the same with `--board rpi_pico` (`--out ...plant-io-pico-usb-serial.json`), then `python3 tools/hil/validate_plant_io_evidence.py --level hil specs/012-zplc-2-1-plant-simulation/evidence/plant-io-*-usb-serial.json`. Repeat each once with `--frame-ms 10` and `--frame-ms 50` (the latency evidence at three frame periods).

## Task F2: Scheduler integration (wave 2)
**Spec:** LNK-003, LNK-006, LNK-007, LNK-010, LNK-011, LNK-015, LNK-016, IO-013. **Depends on:** F1. **Allowed edit surfaces:**
```
CORE/src/core/zplc_sched_core.c
CORE/include/zplc_sched_core.h
CORE/src/hal/zephyr/zplc_scheduler_zephyr.c
CORE/tests/test_plant_sched.c
CORE/tests/include/zplc_sched_trace_cases.h
```
**Design:**
- `zplc_sched_port_t` gains `void (*plant_latch_inputs)(void *ctx)`, called by `zplc_sched_core_scan` under the image lock right after `latch_inputs` (the Zephyr adapter's `port_latch_inputs`, `zplc_scheduler_zephyr.c:832-837`, applies the exchange queue and then the pins; the plant must come after both, so the core calls the new op after `latch_inputs` returns). NULL on the FreeRTOS adapter and single-task: no change for them (IO-013).
- `zplc_sched_scan_report_t` (`zplc_sched_core.h`) gains `uint8_t plant_exit`; the core sets it when `zplc_plant_tick()` is non-zero, **after the commit and with every lock released**, and the adapter acts on it as it acts on `paused` and `faulted`: it drives the pins safe and stops through its STOP path (R-M6-5). **Unconfirmed:** whether stopping from the scan thread at the end of a scan is race-free in the Zephyr adapter (`zplc_sched_stop` takes locks the scan thread must not hold); the writer reads `zplc_sched_stop` and the report handling first and, if the call must be deferred, uses a `k_work` item exactly as the fault path defers `stop_releases`, recording the choice in the commit body.
- `zplc_io_write_outputs` (`zplc_sched_core.c:1007`) starts with `if (zplc_plant_holds_outputs()) return zplc_io_drive_safe(ops);` (R-M6-6; the safe level is chosen in that one function, `:1033`). The exit rule forces the hold from the scan that fired it.
- The scheduler's STOP path, program load, RESET and fault call `zplc_plant_exit(RUN_CONTROL or FAULT)` so the mode can never outlive the run (R-M6-5), through the same funnel the proto engine uses.
- Trace: add `ZPLC_SCHED_TRACE_PLANT` (a = frames applied) at the end of the enum **only if** `test_sched_equivalence.c` still passes unchanged (**Unconfirmed**; if it breaks, no trace kind is added and the counters in the stats are enough).
**Failing tests (`test_plant_sched.c`, a scripted plant against the scheduler core through a test port; the table of `test_sched_core.c` is the model):** `plant_sched_bound_input_overrides_pin_unbound_follows_pin`, `plant_sched_forced_input_wins`, `plant_sched_frame_applies_whole_at_one_latch` (threads: scanner plus a link thread writing frames whose BOOLs and REAL must always be seen from one frame), `plant_sched_pins_safe_image_published` (a program raises an output: the image and the response carry it, the recorded pin write is the safe level), `plant_sched_mirror_on_pins_follow_image`, `plant_sched_mirror_off_again_returns_to_safe_next_commit`, `plant_exit_reason_closed_stops_safe`, `plant_exit_reason_timeout_stops_safe`, `plant_exit_reason_session_end_stops_safe`, `plant_exit_reason_link_lost_stops_safe`, `plant_exit_reason_run_control_stops_safe`, `plant_exit_reason_fault_stops_safe` (each: state STOPPED, pins at the declared safe level, image reset, forces cleared, **no further scan applies plant values and no pin input is sampled into the image**), `plant_sched_stale_values_never_exceed_timeout_plus_one_scan`, `plant_sched_without_plant_is_unchanged` (the previous behaviour of `zplc_io_write_outputs` and the latch with the mode inactive, byte for byte), `plant_sched_declared_safe_level_is_used` (a program that declares a safe level of 1 gets 1 on the held pins).
- [ ] RED, implement, GREEN with the G9 command (`-R "test_plant_sched|test_sched|test_safe_state|test_exchange"`), the 32-bit variant, full host suite; the parent runs `run.sh native` after the merge; commit `feat(core): feed inputs from the plant link and hold the outputs while it runs`.

## Task S2: The board plant link (wave 2)
**Spec:** LNK-003, LNK-007, LNK-011, LNK-014, LNK-015, LNK-017 (serial), LRN-018, P15 (not applicable: real time). **Depends on:** S1. **Allowed edit surfaces:**
```
IDE/src/plant/board/portTypes.ts
IDE/src/plant/board/boardPlantLink.ts
IDE/src/plant/board/frameCodec.ts
IDE/src/plant/board/latency.ts
IDE/src/plant/board/fakeBoard.ts
IDE/src/plant/board/boardPlantLink.test.ts
IDE/src/plant/board/frameCodec.test.ts
IDE/src/plant/board/latency.test.ts
IDE/src/runtime/connectionManager.ts
```
**Design (Plan choices):** `createPlantIoController` (C-M6-3) enters with the layout `planExchange(map, ioMap)` already builds (`IDE/src/plant/session/exchange.ts`, imported, not copied): its `sensors` become the input descriptors and its `commands` the output descriptors, so binding stays explicit and checked (LNK-002). `frameCodec.ts` packs and unpacks the value encoding of C-M6-1 (BOOL bitmap, then INT and REAL in descriptor order) and is tested against `plant_vectors.json`. The loop runs on the wall clock, one exchange every `frameMs` (a multiple of `core.stepMs`, 5): each tick sends the sensors the plant produced, receives the commands of the board's last scan, and advances the core by the measured whole multiples of `stepMs` since the last tick, never skipping a step (the plant follows real time against a board; there is no virtual clock, LNK-014). The plant-side order of one exchange is `exchangeScan` of the scenario seam (`IDE/src/test-engine/scenePort.ts:115`), imported, so a scene behaves the same as in simulation. A rejected or timed-out request makes the controller call `exit` itself and go to `left`; an `EVT_PLANT_EXIT` from the device sets `left` with its reason; every path ends with the plant paused (the core stops advancing). `fakeBoard.ts` is a faithful TypeScript model of the firmware contract (R-M6-1 to R-M6-7), built from the same `plant_vectors.json`, used by this lane's tests, by U3's journeys and by S5; it is **not** the evidence of the firmware, only of Studio's side. `connectionManager.ts` gains one accessor, `plantBoardPort()`, that returns the adapter's port or null.
**Failing tests:** `start enters with the layout of planExchange and mirror off`, `a frame carries the sensors in descriptor order and the response commands reach the core`, `a scene run against the fake board reaches the same facts as the same scene against the simulated runtime for the same input script` (the shared seam; checks PLT-017's spirit against a board model), `INT and REAL signals round trip with their ranges`, `rtt and gap statistics over a scripted trace (p50, p95, max, rolling window of 200)`, `late and rejected counters come from the response flags`, `a device exit event ends the controller in phase left with the reason and pauses the plant`, `a missed response for more than timeoutMs exits and leaves`, `stop sends exit, pauses the plant and leaves it in left`, `setMirror sends PLANT_MIRROR and the snapshot flag follows only the response`, `pulseWarning appears when the rolling worst gap plus scanMs exceeds the scene's shortestPulseMs and not otherwise` (LNK-014), `unsupported firmware: phase unsupported with the reason in both languages and no frame is ever sent`, `start refuses without a mapped signal or when planExchange throws, with the located message`.
- [ ] RED (`bun test src/plant/board`), implement, GREEN, `bunx tsc -b`, `bun run lint`; commit `feat(plant): drive a board from the plant over the device link`.

## Task F4: Application wiring, Twister test, application link test, size (wave 3)
**Spec:** LNK-007, LNK-008 (firmware half: session rule), LNK-010, LNK-011, LNK-016, LNK-017 (serial), G12. **Depends on:** F1, F2, F3. **Allowed edit surfaces:**
```
APP/src/shell_cmds.c
APP/prj.conf
APP/boards/*.conf
TESTS/plant_io/CMakeLists.txt
TESTS/plant_io/prj.conf
TESTS/plant_io/testcase.yaml
TESTS/plant_io/src/main.c
TESTS/app_plant_link/test_app_plant_link.py
tools/firmware-test/size-budget.json
```
**Design:** in `link_start` (`APP/src/shell_cmds.c:4410-4455`) assign the plant ops when `CONFIG_ZPLC_PLANT_IO` is set: `lk_plant_enter` checks the runtime is RUNNING with a program (`zplc_sched_get_state`, `CORE/include/zplc_scheduler.h:319`), then calls `zplc_plant_enter`; `lk_plant_frame` calls `zplc_plant_frame`; `lk_plant_exit` calls `zplc_plant_exit(CLOSED)` and the scheduler stop; `lk_plant_mirror`; `lk_plant_status`. The plant lock hook is a `k_spinlock` for the bounded copies (never held across I/O), the clock hook is the uptime in ms. `link_service` (`:4390`, every `LINK_SERVICE_MS` = 20) also calls the exit funnel for a plant that timed out while no scan runs (a paused or stopped scheduler); the scan's own `zplc_plant_tick` is the normative path. `zplc_proto_link_lost` is already called when DTR falls (`link_watch_line`, `:4381`); the ESP32-S3 USB-Serial/JTAG controller and `native_sim` report no line, so **only the timeout detects a lost link there** (Findings 3).
**Failing tests:**
- Twister `TESTS/plant_io` (`testcase.yaml` modelled on `TESTS/scheduler_run_control`, platforms `native_sim/native/64`, `native_sim/native`, `qemu_cortex_m3`; ztest on the real Zephyr scheduler with the board table of `TESTS/io_table` and `gpio_emul` where the table needs it): `plant_io.enter_requires_running_program`, `plant_io.entry_exit_stops_safe`, `plant_io.timeout_stops_safe`, `plant_io.link_loss_by_proto_link_lost_stops_safe`, `plant_io.hold_on_gpio_emul` (the emulated pin of an output stays at the safe level while the image bit is set; mirror on makes it follow), `plant_io.forced_input_wins`, `plant_io.bound_input_from_plant_pin_input_from_pin`, `plant_io.scan_never_blocked_by_link_thread`.
- `TESTS/app_plant_link/test_app_plant_link.py` (the structure of `TESTS/app_device_link/test_app_device_link.py`: builds `firmware/app` for `native_sim/native`, drives `zplc link <hex>` on stdin and reads `ZF:` lines): `hello advertises PLANT`, `plant frames need a session`, `entry refused while stopped`, `entry, ten frames, exit: STOPPED and outputs safe`, `silence for the timeout stops the program`, `session close stops the program`, `session idle timeout (five seconds in this build) stops the program`, `a damaged frame is counted and does not refresh the timeout`, `output response carries the program's output while the pin is held`, `the text shell keeps working beside the plant link`. Also run a second build with `CONFIG_ZPLC_PLANT_IO=n` and check the hello has no bit 12 and the five ids answer `UNSUPPORTED` (the previous-behaviour test of the shared engine).
- `size`: the parent runs `run.sh size`; F4 records flash and RAM before and after per board in the commit body and raises `size-budget.json` only where needed, with the reason (G12). If the Pico or the RP2040-Zero does not fit, `CONFIG_ZPLC_PLANT_IO=n` in its board conf is the fallback **only with a finding to the owner**, because the Pico is a learner board and D-17 requires its HIL evidence.
- [ ] RED (build fails or tests absent), implement, GREEN: the writer runs only what G9 allows (host tests of the touched core files, `python3 -m py_compile` of the new Python); the **parent** then runs, one at a time and serially, `tools/firmware-test/run.sh native`, `native32`, `qemu-m3`, `app-native`, `size` and `python3 firmware/tests/app_plant_link/test_app_plant_link.py` with `ZPLC_FW_WS=$HOME/zplc-zephyr-ws`, and pastes the summary lines into the commit body; commit `feat(app): serve plant I/O mode on the device link of the firmware application`.
- The parent adds one CI step after the `app_device_link` step (`.github/workflows/ci.yml:~427`) running the new Python test with the same environment (the Twister test needs no step: it is under `firmware/tests`, which `west twister -T zplc/firmware/tests` already takes).

## Task F5: Independent firmware review and attack tests (wave 4)
**Spec:** the risk note of LNK ("It needs an independent review before merge"). **Depends on:** F4 merged on a review branch. **Allowed edit surfaces** (the reviewer writes only tests):
```
CORE/tests/test_plant_attack.c
CORE/CMakeLists.txt
```
A fresh agent that wrote no F task reads the whole diff (`git diff a2c80b32..HEAD -- firmware tools/contract`), runs `gentle-ai review assess --cwd <repo> --agent claude-code --json` and, when `review_due` is true, the native review under the consent rules, and attacks each item: wrap-around of `seq` at `0x7FFFFFFF`; a frame while a program load is in flight; ENTER immediately after a link takeover; two links alternating frames; mirror toggled in the same scan as an exit; an exit raised in the scan that also faults; the scan thread and the link thread racing at the latch (ThreadSanitizer build once: `-fsanitize=thread` in a separate build directory, **Unconfirmed** that the tests are TSan-clean at baseline, so the reviewer first records the baseline); a REAL with a signalling NaN and a denormal; frame lengths 0, 1, `in_bytes - 1`, `in_bytes + 1`, the engine maximum; an entry with `timeout_ms` 49 and 2001; `n_in = 0` and `n_out = 0` (an entry with no inputs is legal: outputs only; one with neither is `BAD_REQUEST`); the pin write count during hold (no glitch to the unsafe level between the commit and the safe write: **the order of the writes in one scan**); the exit when the board's `safe` is 1; forces of an input byte set before the entry and cleared after. Each confirmed defect becomes a failing test in `test_plant_attack.c` and one **correction batch** by the F lane owner; one recheck; a second correction only if the same blocker still fails; blockers still open become one **Needs your decision** result. Commit `test(core): attack the plant I/O mode`.

## Task S5: Qualification rule and the pulse of the four 2.0 plants (wave 3)
**Spec:** LNK-014, SCN-007, CRS-009 (data only). **Depends on:** S2; the final numbers depend on H8. **Allowed edit surfaces:**
```
IDE/src/plant/board/qualify.ts
IDE/src/plant/board/qualify.test.ts
IDE/src/plants/plantPulses.ts
IDE/src/plants/plantPulses.test.ts
specs/012-zplc-2-1-plant-simulation/evidence/plant-io-qualification.json
```
**Design:** `qualify(scene, evidence)` is pure: for each transport in the validated evidence files it applies R-M6-8 (`shortestPulseMs >= worstGapMs + scanMs`) and returns `{ qualifies: true }` or `{ qualifies: false, reason: { en, es } }` naming the worst gap, the pulse and the scan (the reason LRN-011 asks lessons to show). **Question 4** decides whether a scene needs to qualify on **both** learner boards (the default) or per board. `plantPulses.ts` gives the four 2.0 plants a `shortestPulseMs` **measured from their graded scenario traces** (the shortest true-run of each sensor signal in the existing graded scenarios, found by a test that replays them with the engine; **Unconfirmed**: the graded traces' shape is read first, `IDE/src/test-engine/index.ts`), so the 2.0 plants get the same rule as scenes without changing any scenario, hash or grade (P4, PLT-013). Until H8 lands, `qualification.json` is generated from the **fake board** numbers and carries `"level": "fake"` with `"provisional": true`; `qualify` refuses to return `qualifies: true` from a `fake` or `native-sim` level (the evidence-honesty rule G10), so no scene is offered the hardware track before real evidence exists.
**Failing tests:** `a scene whose pulse is above worstGap + scan qualifies`, `a scene below it does not and the reason names the three numbers in English and Spanish`, `a fake or native-sim evidence level never qualifies`, `both-boards rule: one board failing closes the scene`, `the four 2.0 plants have a measured pulse and no scenario, hash or grade changed` (runs the existing parity suite, `IDE/src/plants/plantParity.test.ts`), `every scene manifest in plant-scenes has a pulse or the test names it`.
- [ ] RED, implement, GREEN (`bun test src/plant/board src/plants`), `bunx tsc -b`; commit `feat(plant): decide which scenes can run against a board from measured latency`.

## Task D6: Documentation in English and Spanish (wave 3)
**Spec:** LNK-012, LNK-014, P6, G10, G11. **Depends on:** F3, S2. **Allowed edit surfaces:**
```
docs/docs/plant/plant-io-mode.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/plant-io-mode.md
docs/docs/development/firmware-testing.md
docs/i18n/es/docusaurus-plugin-content-docs/current/development/firmware-testing.md
```
The parent adds the new page to `docs/sidebars.js` and runs `tools/docs` checks. Content: what the mode is; who starts it (a person, never AI or MCP); what the board does with its outputs (safe by default, mirroring by a person); what happens on exit, timeout and link loss (program stopped, outputs safe, a person runs it again); the wire in one table; the staleness bound `timeout_ms + one scan`; which evidence exists **at which level** (host, native simulator, QEMU, size, emulation, HIL) and, until H8 lands, a sentence that **no board has hardware evidence yet** (P6); how to read the latency and the pulse warning; what firmware without the capability shows. No claim about a board until its `hil` file exists. Check: `bun run docs:check` or the repo's docs commands (**Unconfirmed**: read `package.json` scripts) and `python3 tools/hil/validate_docs_parity.py`; commit `docs(plant): document plant I/O mode`.

## Task V7: Evidence run on this machine (wave 4, parent)
Run, serially, `tools/firmware-test/run.sh host host32 native native32 qemu-m3 app-native size`, `python3 firmware/tests/app_plant_link/test_app_plant_link.py`, the E1 rehearsal against `native_sim`, then in `IDE/` the full `bun test`, `bunx tsc -b`, `bun run lint`, and at the root `bun run typecheck` and the format check. Write `specs/012-zplc-2-1-plant-simulation/evidence/m6-linux-x64.json` (`level` per entry, the commit, tool versions, pass counts, flash and RAM per board against budget). Report any failure honestly; the only claim it supports is "host, native simulator, QEMU, emulation and target build".

## Task H8: HIL runs (wave 5, **Owner**)
The Owner, with the board on the bench, runs the commands of Task E1 on the ESP32-S3-DevKitC-1 and on the Raspberry Pi Pico, three frame periods each, and performs the three physical confirmations. The agents do not touch the boards. The resulting `plant-io-*.json` files are committed (or handed to the parent) and validated with `validate_plant_io_evidence.py --level hil`; S5's `qualification.json` is regenerated from them; D6's page and the README of `tools/hil` gain the measured worst case per transport (LNK-014: "the worst case per transport MUST be published as evidence"). Until these files exist, plant I/O mode is **target-build evidenced on seven boards and HIL-unproven on both learner boards**, and every report says so.

## Task C6: Requirement coverage (wave 4)
Update the coverage data the way `plan-m4.md` Task C3 does for its requirements: LNK-006 to LNK-018 are covered by the tests named above; LNK-016 and LNK-017 carry a **conditional/pending** record until H8 (HIL) and until question 2 is answered (TCP). Run `bun tools/ci/requirement-coverage.ts --check` (the exact flags are **Unconfirmed**: read the header of `tools/ci/requirement-coverage.ts`). Commit `test(ci): record requirement coverage for the M6 requirements`.

## Where the Studio surfaces live (named, not planned: they belong to U3, `plan-u3.md`)
| Surface | Requirement | Task in plan-u3 (to be confirmed by its author) | What M6 provides it |
|---|---|---|---|
| Menu item "Feed the board from the plant" in the Online menu and a button in the plant document while a board is connected | PLS-008, LNK-008 | the PLS-008 action task | the command `online.feedBoardFromPlant` (S4), disabled |
| The alert dialog that confirms it | UX-020, LNK-008 | the same task | the key `plantIo.confirm.body` and `confirmAction` (`IDE/src/store/actionConfirm.ts`) |
| The status-rail indicator with its third state (text, icon and colour different from Simulation and Board), the mirror mark and the latency in its details | PLS-008, LNK-008, LNK-014, UX-018 | the PLS-008 indicator task | `PlantIoSnapshot` (C-M6-3): `phase`, `mirror`, `rttMs`, `gapMs`, `late`, `pulseWarning` |
| The "from the plant" read-only mark on a fed input in the Watch faceplate, still forceable | PLS-007, LNK-006 | the PLS-007 task | `planExchange(...).sensors` (the names fed by the plant) |
| The mirror toggle | D-16, LNK-010 | the PLS-008 task | `PlantIoController.setMirror` |
U3 flips `enabled` of the command in the **same commit** that mounts the indicator (rule G7); until then the feature is reachable only through the Owner's bench script.

## Open questions for the owner
1. **What happens when a person asks to leave plant I/O mode?** (R-M6-5.) (A) The program is STOPPED and outputs go safe, exactly as for a timeout, and the person presses RUN to continue in pin mode (one rule, no state that runs on pins by itself). (B) A person's own exit returns the running program to pin inputs; only timeout, link loss and session end stop it. **Recommended default: A**, because LNK-011 and P9 forbid returning to pins and continuing by itself for the automatic reasons, and one rule for every reason is the smaller thing to prove and to explain.
2. **TCP (LNK-017 says SHOULD).** The Zephyr firmware has no TCP transport for the device link (the framed link rides the text shell, `APP/src/shell_cmds.c:4357-4483`); TCP exists only in the host runtime. (A) 2.1.0 ships plant I/O over USB serial; the engine is proven on a network-transport link on the host (authenticated), and a TCP device link for the four network-capable boards is a later release. (B) Build a Zephyr TCP device link in M6 (sockets, the authentication key provisioning of COM-021, bring-up on Wi-Fi boards), which is a new product feature of its own. **Recommended default: A.**
3. **Default plant timeout.** The firmware grants 50 to 2000 ms. A shorter timeout is safer and stops the board sooner when Studio stalls; a longer one tolerates a busy renderer. **Recommended default: 500 ms** (Studio asks for it; the Owner's HIL runs at three frame periods show whether USB-serial jitter allows less), published with the staleness bound `timeout + one scan`.
4. **Qualification rule for the hardware track.** (A) A scene is offered the hardware track only if it qualifies by R-M6-8 (`pulse >= worst gap + one scan`) on **both** learner boards over USB serial. (B) Per board: a scene may be available on one board and closed on the other. **Recommended default: A** (one course, one track list; a learner with either board gets the same lessons), with the reason shown in the closed lessons.
5. **Where the manifests of the lessons change.** The hardware track of the ten 2.0 plant lessons and of the new scenes (`course-outline.md` assumption A1, CRS-009, CRS-010) needs the owner's approval of the outline (CRS-001). (A) M6 delivers the capability, the evidence and the qualification data; **lesson manifests, wiring text and "what to connect" pages change in M7**, after the approval. (B) M6 also edits the ten 2.0 manifests now. **Recommended default: A.**

## Findings in the spec and in the merged code (contradictions and things that could not be verified)
1. **LNK-017 TCP has nothing to build on.** The only place the framed link is wired on Zephyr is the shell (`APP/src/shell_cmds.c:3909`, `:4357` `link_write` prints `ZF:<hex>` lines, `:4470` `zplc link <hex>`); `rg ZPLC_PROTO_TRANSPORT_NETWORK firmware --glob '*.[ch]'` finds the TCP transport only in `firmware/apps/posix_host/src/native_device_link.c:578` (the host runtime) and in tests. The spec (LNK-017, "SHOULD work over TCP on boards with a network interface") and the course-outline do not know this. Question 2.
2. **LNK-016's premise is right, but the memory-write path already exists and is not enough.** `zplc_io_sample` reads only table channels as 16-bit values (`CORE/src/core/zplc_sched_core.c:938-946`), as the spec says. A plant value could instead go through the exchange write queue (`zplc_exchange_write`, force-aware, atomic, `CORE/include/zplc_exchange.h`), and M1 does exactly that in simulation. It does not work for a board because (a) the Zephyr adapter applies the exchange queue **before** the pins (`zplc_scheduler_zephyr.c:832-837`: `zplc_exchange_latch()` then `zplc_io_apply_samples()`), so a pin sample overwrites a plant bit on the same byte; (b) the queue is 1024 bytes and a write is whole bytes, so a BOOL cannot be set without clobbering its neighbours; (c) it has no validation, session or timeout notion. Hence the new port op called after the pins.
3. **Link loss is only detectable by silence on two of the target families.** DTR drops end the session at once on a USB CDC ACM console such as the Pico (`APP/src/shell_cmds.c:4376-4385`), but the ESP32-S3 USB-Serial/JTAG controller and `native_sim` report no line. On the ESP32-S3 the plant timeout (R-M6-4) is the **only** detection, which is why it is a firmware rule and not a Studio courtesy. The Twister tests of the spec ("link loss") can only simulate it with `zplc_proto_link_lost` and with silence.
4. **Events cannot carry the plant outputs.** The device link's service tick is 20 ms (`LINK_SERVICE_MS`, `:3906`) and events pass a queue with a 64-byte payload (`ZPLC_PROTO_EVENT_PAYLOAD_MAX`, `CORE/include/zplc_proto_defs.h:32`); a pushed output stream would quantize every round trip to 20 ms. The plan uses request/response.
5. **The shell transport is hex over lines.** One 138-byte frame is `2 * (138 + 47) + 11` characters (`APP/prj.conf:60`); the Pico payload is capped at 288 (`APP/boards/rpi_pico_rp2040.conf:79`). Whether USB-serial round trips of that size meet 20 ms is **unknown until H8**; the spec says the same ("The latency of the link over USB serial is not known"), and the design makes that a measured, published fact rather than an assumption. Shell echo and the Zephyr shell's own line handling may dominate: **Unconfirmed**.
6. **Size headroom is small on the Pico.** `tools/firmware-test/size-budget.json` leaves 9032 bytes of flash and 8850 of RAM on `rpi-pico-rp2040` (measured 177848 and 173424 against 186880 and 182272). The plant module's static staging is about 400 bytes with 32 slots; the code cost is **Unconfirmed** until F4 measures it. The budget file's own rule covers a justified raise (G12).
7. **The Zephyr workspace is shared state.** `run.sh` re-points `~/zplc-zephyr-ws/zplc` at the running checkout (`run.sh:101-103`; it is currently a symlink to another worktree, `ws-integration`) and writes `~/zplc-zephyr-ws/out`. Parallel writers running Zephyr modes would corrupt each other; rule G9. This applies to every parallel firmware plan, not only M6.
8. **Only scenes declare `shortestPulseMs`.** SCN-007 puts it on scenes (`IDE/src/plant/contracts.ts:14`; values in the 17 scene manifests range from 20 to 1300 ms); the four 2.0 plants have none, but LNK-007 and CRS-010 give them the hardware track. S5 measures it from the graded traces (**Unconfirmed** that the traces expose pulse widths directly). The scene with a 20 ms pulse will not qualify against any realistic gap; that is the expected outcome of LNK-014's last sentence, not a defect.
9. **Deploy admission skips the system register area and would otherwise refuse the lesson.** `checkProgramIo` ignores `%I` bytes at or above `SYSTEM_REGISTER_OFFSET` (`IDE/src/boards/ioAdmission.ts:73-76`), and refuses any other byte with no board channel (`:110-118`); `conveyor-classification-jam` reads seven inputs on a four-input board (`IDE/lessons/conveyor-classification-jam/lesson.json:14`). LNK-013 is what lets that lesson be admitted, so S3 is on the critical path of the hardware track.
10. **A force of one bit is a force of a byte.** `zplc_force_set_bytes` works on byte extents (`CORE/include/zplc_core.h:493`); whether a forced BOOL input protects only its bit or its byte against the plant is **Unconfirmed**; F2 pins the actual behaviour in a test and the docs state it.
11. **LNK-008 "per session" is satisfied by the session rule, not by a person-detector.** The firmware cannot know who is at the keyboard; it requires an open session (COM-020) and, on a network transport, the authentication of COM-021. "A person" is enforced in Studio (G7, G8) and by the confirmation of the bench script. The spec's wording is met at that level; a hostile program with a session could still enter the mode, as it could already force and write memory.
12. **No catalogued board has an analog output,** so the hold covers digital outputs only (`firmware/app/boards/boards.json`: zero `%QW` and `%QD` channels on all seven). If a future board adds one, R-M6-6 must be extended with the analog safe value.
13. **Single-task and FreeRTOS builds:** which catalogued board uses the single-task configuration is **Unconfirmed** (`rg SINGLE firmware/zephyr/Kconfig` finds nothing); M6 leaves both without the op and without the capability, so they behave as today and Studio reports "unsupported".

## Done when (aligned with spec section 7, for M6)
1. A board running the firmware can be fed from the plant: the host closed-loop suite, the Twister suite, the application link test and the emulation run all pass, with the evidence file `m6-linux-x64.json` recording **host, native simulator, QEMU, emulation and target build for seven boards**, each labelled with its level.
2. Every exit reason leaves the program STOPPED with outputs safe, and no test finds a scan that applies plant values or samples pins into the image after an exit (LNK-011); the independent review (F5) found no open blocker.
3. The mode is a negotiated capability; firmware without it is reported in both languages; the capability is absent from a build with `CONFIG_ZPLC_PLANT_IO=n` (LNK-012).
4. Deploy admission and the build check count plant-fed inputs as provided and still refuse the rest (LNK-013).
5. No AI, MCP or Learn path starts the mode; the command ships disabled until U3 mounts the indicator (LNK-008, LNK-009).
6. The latency of the link is measured and shown by Studio on every exchange, and the qualification rule is implemented; **the worst case per transport is published only when the Owner's HIL files exist** (LNK-014, LNK-016). Until H8, every document says "no board has hardware evidence for plant I/O mode", and `qualify` returns no scene as offered.
7. Docs in English and Spanish exist; root `bun run typecheck`, `bun test` and `bun run lint` in `IDE/`, the pinned formatter check and the docs checks pass; requirement coverage records LNK-006 to LNK-018 with LNK-016 and LNK-017 conditional where evidence or the owner's answer is still pending.
