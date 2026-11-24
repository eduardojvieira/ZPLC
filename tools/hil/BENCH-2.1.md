# Plant I/O bench for ZPLC 2.1 (Task H8 of `specs/012-zplc-2-1-plant-simulation/plan-m6.md`)

The run sheet for the HIL evidence of plant I/O mode on the two learner boards (decision D-17): the
ESP32-S3-DevKitC-1 and the Raspberry Pi Pico. Until these runs exist, no board has hardware evidence for plant I/O
mode (P6), and `plant-io-qualification.json` offers no scene.

Who does what. The owner authorized the agent to build, flash, deploy and run the bench scripts on boards the owner
connects ("los hil los haces vos, yo solo te conecto las placas", 2026-11-13; "Cuando conecte la ESP32-S3 y la Pico,
corrés vos con la excepción que ya autoricé", 2026-11-24). That is an exception to AGENTS.md rule 7 and to "a person
runs both" of `tools/hil/README.md`, for this owner's bench only. Every step below is marked:

- **[agent]**: the agent runs it, under that exception. Studio's AI and MCP still never start plant I/O mode (LNK-009).
- **[person]**: only a person can do it: a button, a cable, a wire, or looking at an LED.

## Before the bench (agent, once)

The native-simulator rehearsal must pass first (it did: L192, and again on 2026-11-24 at 20, 10 and 50 ms, all
`ok` under `validate_plant_io_evidence.py --level native-sim`). Then, from a clean checkout of the commit under test
(`REPO`), so that the evidence names a clean commit:

```bash
export TMPDIR=$HOME/.cache/zplc-tmp
REPO=<the clean checkout under test>; BENCH=$TMPDIR/bench; EV=specs/012-zplc-2-1-plant-simulation/evidence
mkdir -p "$BENCH" && cd "$REPO" && . tools/firmware-test/env.sh
ln -sfn "$REPO" "$ZPLC_FW_WS/zplc"   # what run.sh does; the workspace is shared state (rule G9): one build at a time
```

**[agent]** The echo program the bench checks against (the one of `tools/hil/README.md`, step 2):

```bash
cat > "$BENCH/echo.st" <<'EOF'
PROGRAM Echo

VAR_INPUT
    In0 AT %IX0.0 : BOOL;
    In1 AT %IX0.1 : BOOL;
END_VAR

VAR_OUTPUT
    Out0 AT %QX0.0 : BOOL;
    Out1 AT %QX0.1 : BOOL;
END_VAR

Out0 := In0;
Out1 := In1;

END_PROGRAM
EOF
bun packages/zplc-ide/src/cli/index.ts compile "$BENCH/echo.st" --output "$BENCH/echo.zplc"
```

At `18868df8` it is 136 bytes with CRC-32 `e3ab27e9`, the same as the rehearsal record.

## The serial port

The scripts open the port through `ZPLCTester` (`tools/hil/zplc_tester.py`), which takes, in this order: `--port`,
`ZPLC_SERIAL_PORT` (or the older `ZPLC_PORT`), then the one port whose USB identifiers match the board in
`tools/hil/usb-ids.json`. With no match, or more than one, it stops and names what it saw (HIL-007).

| Board              | USB identifiers                            | Linux device     | Shell on                |
| ------------------ | ------------------------------------------ | ---------------- | ----------------------- |
| ESP32-S3-DevKitC-1 | `303A:1001` (USB-Serial/JTAG of the chip)  | `/dev/ttyACM<n>` | the port marked **USB** |
| Raspberry Pi Pico  | `2E8A:000A` (the firmware's CDC ACM shell) | `/dev/ttyACM<n>` | its only USB port       |

Pass no `--port` and set no `ZPLC_SERIAL_PORT` for the bench: the cable pull of sequence 3 can bring the board back
under a new name (`ttyACM1` while the old descriptor is still open), and the bench opens the port again after it. The
lookup by identifiers finds the new name; a fixed path does not. The DevKitC-1's other port (marked UART, a
`10C4:EA60` bridge, `/dev/ttyUSB<n>`) carries no shell and matches nothing. The Waveshare RP2040-Zero has the Pico's
identifiers: do not plug it in during the Pico runs.

## ESP32-S3-DevKitC-1

1. **[person]** Wire the two LEDs, plug the power cable into the port marked **UART** and the data cable into the port
   marked **USB** (see the checklist at the end).
2. **[agent]** Build:

   ```bash
   (cd "$ZPLC_FW_WS" && west build -p always -b esp32s3_devkitc/esp32s3/procpu zplc/firmware/app -d "$ZPLC_FW_WS/out/bench/esp32s3_devkitc")
   ```

   This is the `build_command` of `firmware/app/boards/boards.json` in the workspace form `run.sh` uses.

3. **[agent]** Flash (the port is the `303A:1001` device; `eza -l /dev/serial/by-id/` names it):

   ```bash
   "$ZPLC_FW_WS/.venv/bin/esptool" --chip esp32s3 --port /dev/ttyACM<n> write-flash 0x0 "$ZPLC_FW_WS/out/bench/esp32s3_devkitc/zephyr/zephyr.bin"
   ```

   **[person]** Only if esptool cannot connect: hold BOOT, press and release RST, release BOOT, and the agent runs it
   again. **[person]** If the console stays silent afterwards, press RST.

4. **[agent]** Deploy the echo program (it is stored in flash and survives a reset, which restores it stopped):

   ```bash
   python3 -B -c 'import sys; sys.path.insert(0, "tools/hil"); from zplc_tester import ZPLCTester; t = ZPLCTester(board=sys.argv[1]); t.upload_bytecode(open(sys.argv[2], "rb").read()); print(t.send("zplc version")); t.close()' esp32s3_devkitc "$BENCH/echo.zplc"
   ```

5. **[agent + person]** The three runs (see "How a run goes" for the prompts):

   ```bash
   python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 20 --out $EV/plant-io-esp32s3-usb-serial.json
   python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 10 --out $EV/plant-io-esp32s3-usb-serial-10ms.json
   python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 50 --out $EV/plant-io-esp32s3-usb-serial-50ms.json
   ```

On this board the chip's USB port reports no line state, so link loss is detected only by the plant timeout (500 ms,
the bench default `--timeout-ms`): the mode ends with `TIMEOUT` (Findings 3 of the plan).

## Raspberry Pi Pico

1. **[person]** Wire the two LEDs (and, preferably, the second power path of the checklist).
2. **[agent]** Build:

   ```bash
   (cd "$ZPLC_FW_WS" && west build -p always -b rpi_pico/rp2040 zplc/firmware/app -d "$ZPLC_FW_WS/out/bench/rpi_pico")
   ```

3. **[person]** Unplug the Pico, hold BOOTSEL, plug the USB cable in with it held, release it. A drive named `RPI-RP2`
   appears.
4. **[agent]** Flash by copying the image (there is no picotool here; the boot ROM takes the file):

   ```bash
   udisksctl mount -b /dev/disk/by-label/RPI-RP2   # only if the desktop did not mount it
   cp "$ZPLC_FW_WS/out/bench/rpi_pico/zephyr/zephyr.uf2" "/run/media/$USER/RPI-RP2/" && sync
   ```

   The board writes it, restarts by itself and comes back as `/dev/ttyACM<n>`.

5. **[agent]** Deploy, as for the ESP32-S3 with `rpi_pico` for the board.
6. **[agent + person]** The three runs:

   ```bash
   python3 tools/hil/plant_io_bench.py --board rpi_pico --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 20 --out $EV/plant-io-pico-usb-serial.json
   python3 tools/hil/plant_io_bench.py --board rpi_pico --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 10 --out $EV/plant-io-pico-usb-serial-10ms.json
   python3 tools/hil/plant_io_bench.py --board rpi_pico --transport usb-serial --program "$BENCH/echo.zplc" \
     --frames 5000 --frame-ms 50 --out $EV/plant-io-pico-usb-serial-50ms.json
   ```

On the Pico the USB CDC ACM shell reports its line, so the pull is expected to end the session at once (DTR drops,
Findings 3 of the plan), with the plant timeout as the fallback. The bench does not record which reason ended the mode
at the pull; it records the state and the output image after it.

## How a run goes

There is no mirror flag: every run streams `--frames` frames with mirroring off, then does the three physical
sequences in order, mirror off, mirror on and link loss. A `hil` file is valid only with all three confirmed.

The bench needs an interactive terminal (rule G7): it refuses when stdin is not a terminal, and it starts only when
the board id is typed. The agent's shell has none, so the agent runs it in tmux and relays: it types the board id only
after the person says the board is connected and its outputs are safe to drive, and each `yes` or `no` only as the
person answered it. The person may instead type in that terminal (`tmux attach -t bench`).

```bash
tmux new-session -d -s bench -x 220 -y 50 -c "$REPO"
tmux send-keys -t bench "<one bench command from above>" Enter
tmux capture-pane -p -t bench | tail -20          # read the prompt, tell the person, wait for the answer
tmux send-keys -t bench "<the board id, or yes / no as the person answered>" Enter
```

| Prompt of the bench                                | Who answers                                    | What the person sees or does                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Type the board id (...) to start`                 | **[person]** says go; **[agent]** types the id | Nothing yet. The bench sends RUN if the program is stopped, enters the mode and streams for about 5000 frame periods (100 s at 20 ms, 250 s at 50 ms; at 10 ms it goes as fast as the link answers). The LEDs stay off. |
| `1. MIRROR OFF ... Did the LED stay off?`          | **[person]**                                   | For 5 s the program's outputs toggle in the image, but both LEDs stay **off**: the pins are held at their safe level. Answer `yes` only if they stayed off.                                                             |
| `2. MIRROR ON ... Did the LED follow the outputs?` | **[person]**                                   | For 5 s both LEDs **light and flicker**: DO0 toggles every frame and DO1 every second frame (at 10 and 20 ms DO0 looks dimmed rather than blinking; at 50 ms both visibly blink).                                       |
| `3. LINK LOSS ... Ready to pull the cable?`        | **[person]**                                   | Answer `yes`, then **pull the data cable** (ESP32-S3: the one in the port marked USB; Pico: its USB cable). The bench notices, waits 10 s.                                                                              |
| `Plug the cable back, then press Enter`            | **[person]** plugs it; **[agent]** sends Enter | The bench opens the port again and reads `zplc sched status --json` (must be `idle`, that is STOPPED) and the output image (must be all zero).                                                                          |
| `Is the LED off?`                                  | **[person]**                                   | Both LEDs **off**. Answer `yes` only if they are.                                                                                                                                                                       |

The run ends with `PASSED: <file>` or `FAILED: <file>` and the reasons. A failed file is evidence too: never edit it,
never run over it (the bench refuses an existing `--out`), and report it. A run that stops before it streams (for
example `the board did not answer HELLO`, if the board was still starting: the ESP32-S3 may restart when its port
opens, and the tester waits 1 s) leaves a file that says so. Keep it, give the next attempt its own `--out`
(`...-retry1.json`), and validate the files of the runs that count by name.

## The evidence each run writes

Only the `--out` file, `$EV/plant-io-<board>-usb-serial[-10ms|-50ms].json`, in the format of
`specs/012-zplc-2-1-plant-simulation/evidence/plant-io.schema.json`: `level: "hil"`, the board id, the transport, the
commit and dirty state of the checkout, the firmware identity and its `zplc version` output, the date, the tool
versions, the program size and CRC-32, `rtt_ms` and `gap_ms` (count, p50, p95, p99, max), `late`, `rejected`, the
bench's own counts, the exit (`closed`) or the board's own exit events, the gap limit, and the three physical
sequences with `confirmed_by: "person"`. Then, **[agent]**:

```bash
python3 tools/hil/validate_plant_io_evidence.py --level hil $EV/plant-io-*-usb-serial*.json
(cd packages/zplc-ide && ZPLC_UPDATE_GOLDEN=1 bun test src/plant/board/qualify.test.ts)   # the qualification table from the 20 ms runs
```

and the measured worst gap per board goes into `docs/docs/plant/io-mode.md` (both languages) and `tools/hil/README.md`
(LNK-014: "the worst case per transport MUST be published as evidence").

## What the owner must have ready

- [ ] **Boards.** An ESP32-S3-DevKitC-1 **N8R8** (module ESP32-S3-WROOM-1-N8R8: the image needs the 8 MB octal PSRAM
      and does not start on the N8 or N8R2) and a Raspberry Pi Pico (RP2040; not a Pico W or a Pico 2).
- [ ] **Cables.** USB data cables, not charge-only: two for the DevKitC-1 (USB-C or micro-USB by revision; one into
      **USB** for the shell, one into **UART** for power only), one micro-USB for the Pico.
- [ ] **LEDs, no loopback.** Per board two LEDs, each with a 330 Ω resistor in series, to a GND pin (about 4 mA each):
      ESP32-S3: DO0 = GPIO15 (header J1 pin 8) and DO1 = GPIO16 (J1 pin 9), GND on J1 pin 22.
      Pico: DO0 = GP0 (header pin 1) and DO1 = GP1 (header pin 2), GND on pin 38.
      Not the on-board LED: the echo program drives `%QX0.0` and `%QX0.1`. Nothing on the inputs: in plant mode the
      plant feeds `%IX0.0` to `%IX0.3`. No jumper or loopback wire is needed.
- [ ] **Power while the cable is out.** The DevKitC-1 stays powered from its UART port while the USB cable is pulled.
      For the Pico, preferably power VSYS (pin 39) from a 5 V supply through a Schottky diode, as the Pico datasheet
      shows. Without it the pull also cuts the power: the board then boots with the program stopped, so sequence 3
      still reads `idle`, but it no longer shows that the firmware left the mode on link loss; say so in the log.
- [ ] **USB permissions.** On this machine the user is in `uucp`, which owns `/dev/ttyACM*` on Arch: no udev rule is
      needed. ModemManager and brltty are inactive (checked 2026-11-24), so nothing probes a new port.
- [ ] **Free ports.** No Studio connected to the board, no serial monitor (screen, minicom, picocom, the monitor of
      west), no other HIL script on the port. One learner board on USB at a time is simplest.
- [ ] **Time.** About 20 minutes per board after the wiring: flash and deploy about 5, the three runs about 2, 2 and 5
      minutes of streaming plus the sequences, and three cable pulls per board. About 45 minutes for both.
