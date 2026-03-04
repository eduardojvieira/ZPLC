import argparse
import os
import re
import serial
import subprocess
import time


ANSI_ESCAPE = re.compile(
    r"\x1b\[[0-9;]*[mJKH]|\[8D|\[J|\[1B|\x1b\[[\d;]*m|\x1b\[[\d;]*[A-Z]"
)


def clean(line: bytes) -> str:
    return ANSI_ESCAPE.sub("", line.decode("utf-8", errors="replace")).rstrip()


def reboot_board_openocd(openocd_interface: str, openocd_target: str) -> None:
    subprocess.run(
        [
            "openocd",
            "-f",
            openocd_interface,
            "-f",
            openocd_target,
            "-c",
            "init; reset run; exit",
        ],
        capture_output=True,
        check=False,
    )


def reboot_board_shell(ser: serial.Serial) -> None:
    # NOTE: 'zplc reset' resets the ZPLC VM runtime only — it does NOT
    # trigger a SoC reboot.  On ESP32-S3 with USB-JTAG there is no shell
    # command that causes a hardware reset without breaking the CDC endpoint.
    # Use reboot_and_reconnect() only with --reboot-method=openocd.
    ser.write(b"zplc reset\r\n")
    ser.flush()
    time.sleep(0.5)


def reboot_and_reconnect(
    ser: serial.Serial,
    port: str,
    baud: int,
    reboot_method: str,
    openocd_interface: str = "",
    openocd_target: str = "",
    timeout_s: float = 45.0,
) -> serial.Serial:
    """Reboot the board and return a fresh, verified serial handle.

    On ESP32-S3 with USB-JTAG the CDC endpoint re-enumerates after a CPU
    reset.  The tricky part on macOS is that the /dev node path often stays
    the same (e.g. /dev/cu.usbmodem101) — it never disappears from the
    filesystem — so polling os.path.exists() returns True immediately and we
    end up with a handle to a dead pipe that silently eats all writes.

    Strategy:
      1. Issue the reboot on the existing (possibly dying) handle.
      2. Close the stale handle right away.
      3. Wait up to 5s for the port to *disappear* from /dev (best case).
         If it never disappears, we rely on liveness probing in step 4.
      4. Once the port exists (or after the disappear-wait expires), open a
         new handle and probe it: send a bare CR and wait up to 3s for any
         byte back.  A live CDC endpoint always echoes something (even just
         the prompt).  Repeat until we get a response or timeout_s expires.
      5. Return the live handle; caller must still call wait_for_shell_ready().
    """
    if reboot_method == "openocd":
        reboot_board_openocd(openocd_interface, openocd_target)
    else:
        reboot_board_shell(ser)

    # Close the stale handle BEFORE polling — holding it open on macOS can
    # prevent the OS from reclaiming the CDC endpoint registration.
    try:
        ser.close()
    except Exception:
        pass

    # Step 3 — wait for the port to disappear (up to 5s).
    # On boards where the /dev node *does* cycle (STM32, some ESP32 configs)
    # this is the reliable signal.  On boards where it doesn't, we just fall
    # through after the timeout.
    disappear_deadline = time.time() + 5.0
    while time.time() < disappear_deadline:
        if not os.path.exists(port):
            print(f"[HIL] Port {port} disappeared — waiting for re-enumeration...")
            break
        time.sleep(0.2)

    # Step 4 — probe loop: open + send CR + wait for any byte back.
    probe_deadline = time.time() + timeout_s
    while time.time() < probe_deadline:
        if not os.path.exists(port):
            time.sleep(0.3)
            continue
        try:
            candidate = serial.Serial(port, baud, timeout=0.5)
            time.sleep(0.3)
            candidate.reset_input_buffer()
            # Probe: send a bare CR and look for any output within 3s.
            candidate.write(b"\r\n")
            probe_end = time.time() + 3.0
            got_bytes = False
            while time.time() < probe_end:
                chunk = candidate.read(256)
                if chunk:
                    got_bytes = True
                    break
            if got_bytes:
                candidate.reset_input_buffer()
                return candidate
            # Dead pipe — close and retry.
            candidate.close()
        except serial.SerialException:
            pass
        time.sleep(0.5)

    raise AssertionError(
        f"Timed out waiting for a live serial response on {port!r} after reboot "
        f"({timeout_s:.0f}s). Check USB connection."
    )


def send_cmd(
    ser: serial.Serial, cmd: str, wait: float = 0.8, max_read_s: float = 3.0
) -> list[str]:
    """Send a shell command and collect response lines.

    Reads until the deadline, tolerating gaps in serial output.  We do NOT
    break on the first empty read — the device may briefly pause while it
    persists config to flash or handles an interrupt, and we must not drop
    subsequent log lines.
    """
    ser.write((cmd + "\r\n").encode())
    time.sleep(wait)
    lines: list[str] = []
    deadline = time.time() + max_read_s
    consecutive_empty = 0
    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            consecutive_empty += 1
            # Allow up to 4 consecutive empty reads (~2s with 0.5s timeout)
            # before giving up — this prevents early exit on brief silences.
            if consecutive_empty >= 4:
                break
            continue
        consecutive_empty = 0
        line = clean(raw)
        if line:
            lines.append(line)
    return lines


def wait_for_shell_ready(ser: serial.Serial, timeout_s: float = 25.0) -> None:
    start = time.time()
    seen: list[str] = []
    while time.time() - start < timeout_s:
        ser.write(b"\r\n")
        out = send_cmd(ser, "zplc version", wait=0.5, max_read_s=2.0)
        if any("ZPLC Runtime v" in line for line in out):
            return
        if out:
            seen.extend(out[-5:])
        time.sleep(0.5)

    tail = "\n".join(seen[-20:])
    raise AssertionError(
        "Timed out waiting for shell readiness. Last serial logs:\n" + tail
    )


def read_boot(ser: serial.Serial, seconds: float = 10.0) -> list[str]:
    start = time.time()
    lines: list[str] = []
    while time.time() - start < seconds:
        raw = ser.readline()
        if raw:
            line = clean(raw)
            if line:
                lines.append(line)
    return lines


def assert_contains(lines: list[str], needle: str) -> None:
    if not any(needle in line for line in lines):
        raise AssertionError(f"Missing expected log: {needle!r}")


def assert_contains_any(lines: list[str], needles: tuple[str, ...]) -> None:
    if not any(any(needle in line for needle in needles) for line in lines):
        expected = " | ".join(needles)
        raise AssertionError(f"Missing expected logs (any of): {expected}")


def assert_not_contains_any(lines: list[str], needles: tuple[str, ...]) -> None:
    for line in lines:
        if any(needle in line for needle in needles):
            expected = " | ".join(needles)
            raise AssertionError(f"Found unexpected log matching ({expected}): {line}")


def wait_for_any_log(
    ser: serial.Serial, needles: tuple[str, ...], timeout_s: float
) -> list[str]:
    """Stream serial output until one of the needle strings is seen or timeout.

    Unlike collect_logs, this returns as soon as a match is found —
    reducing overall test time in the success case.
    """
    start = time.time()
    lines: list[str] = []
    while time.time() - start < timeout_s:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if not line:
            continue
        lines.append(line)
        if any(needle in line for needle in needles):
            # Drain a short burst of any follow-up lines before returning
            lines.extend(collect_logs(ser, 1.0))
            return lines
    expected = " | ".join(needles)
    tail = "\n".join(lines[-30:])
    raise AssertionError(f"Timeout waiting for log(s): {expected}\nLast logs:\n{tail}")


def collect_logs(ser: serial.Serial, timeout_s: float) -> list[str]:
    """Collect all available serial lines for the given duration."""
    start = time.time()
    lines: list[str] = []
    while time.time() - start < timeout_s:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if line:
            lines.append(line)
    return lines


def shell_quote(arg: str) -> str:
    escaped = arg.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def trigger_mqtt_reconnect(ser: serial.Serial) -> list[str]:
    """Force the MQTT thread to reconnect by toggling mqtt_enabled.

    We collect ALL output during this sequence — including any MQTT log lines
    emitted by the background thread — so callers can search them without
    needing a separate wait_for_any_log call.
    """
    lines: list[str] = []
    lines.extend(
        send_cmd(ser, "zplc config set mqtt_enabled 0", wait=0.5, max_read_s=2.0)
    )
    lines.extend(send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0))
    lines.extend(
        send_cmd(ser, "zplc config set mqtt_enabled 1", wait=0.5, max_read_s=2.0)
    )
    lines.extend(send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0))
    return lines


# ---------------------------------------------------------------------------
# Phase-specific MQTT security needles
# ---------------------------------------------------------------------------

_SECURITY_FAIL_NEEDLES = (
    "MQTT security setup failed",
    "TLS CA file missing",
    "Mutual TLS requires cert+key",
    "mqtt_connect failed",
    "No CONNACK received",
)

_CONNECT_ATTEMPT_NEEDLES = (
    "Connecting to MQTT broker",
    "mqtt_connect failed",
    "No CONNACK received",
    "MQTT connected",
)


def _needles_present(lines: list[str], needles: tuple[str, ...]) -> bool:
    return any(any(needle in line for needle in needles) for line in lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="HIL test for MQTT security on hardware"
    )
    parser.add_argument(
        "--port", default=os.getenv("ZPLC_SERIAL_PORT", "/dev/cu.usbmodem101")
    )
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument(
        "--openocd-interface",
        default="interface/stlink.cfg",
        help="OpenOCD interface config file",
    )
    parser.add_argument(
        "--openocd-target",
        default="target/stm32h7x.cfg",
        help="OpenOCD target config file",
    )
    parser.add_argument(
        "--reboot-method",
        choices=("shell", "openocd"),
        default="shell",
        help=(
            "How to reset MQTT backoff between phases. "
            "'shell' (default): toggle mqtt_enabled via shell commands — safe on "
            "ESP32-S3 USB-JTAG (never closes the serial handle). "
            "'openocd': full SoC reboot via OpenOCD — use for STM32/SWD targets."
        ),
    )
    parser.add_argument(
        "--no-reset-between-phases",
        action="store_true",
        default=False,
        help=(
            "Skip MQTT backoff reset between Phase 1→2 and Phase 2→3. "
            "Only use this if MQTT backoff is known to be at 2s (fresh boot and "
            "no prior failed attempts). By default the MQTT thread is toggled "
            "off/on before each phase to guarantee backoff starts at 2s."
        ),
    )
    parser.add_argument("--wifi-ssid", default=os.getenv("ZPLC_WIFI_SSID", ""))
    parser.add_argument("--wifi-password", default=os.getenv("ZPLC_WIFI_PASSWORD", ""))
    parser.add_argument("--skip-wifi", action="store_true")

    # Timeout tuning knobs — adjustable per environment without code changes
    parser.add_argument(
        "--phase2-timeout",
        type=float,
        default=30.0,
        help=(
            "Seconds to wait for Phase 2 TLS-fail log after reboot (default: 30). "
            "After a fresh reboot the MQTT thread fires at backoff=2s, so 30s "
            "is generous.  With --no-reboot-between-phases you may need 90+s."
        ),
    )
    parser.add_argument(
        "--phase3-timeout",
        type=float,
        default=30.0,
        help=(
            "Seconds to wait for Phase 3 connect-attempt log after reboot (default: 30). "
            "Same reasoning as phase2-timeout."
        ),
    )
    args = parser.parse_args()

    # Keep the serial handle open for the entire test — NEVER close and reopen.
    # On ESP32-S3 with USB-JTAG, closing the macOS CDC handle kills the
    # endpoint permanently until a physical reset.
    # dsrdtr=False, rtscts=False: prevent pyserial from toggling RTS/DTR on
    # open/close, which would trigger the ESP32 bootloader reset sequence.
    ser = serial.Serial(
        args.port,
        args.baud,
        timeout=0.5,
        dsrdtr=False,
        rtscts=False,
        exclusive=True,
    )
    # Deassert RTS/DTR explicitly so we don't accidentally reset the chip
    ser.dtr = False
    ser.rts = False
    time.sleep(0.5)
    ser.reset_input_buffer()
    try:
        # ----------------------------------------------------------------
        # Boot / shell-ready gate
        # ----------------------------------------------------------------
        wait_for_shell_ready(ser)
        print("[HIL] Shell ready.")

        # ----------------------------------------------------------------
        # Silence MQTT thread immediately — prevents it from flooding the
        # serial port and swamping shell command responses during Phase 1.
        # Phase 2 will re-enable it explicitly.
        # ----------------------------------------------------------------
        print("[HIL] Quiescing MQTT thread...")
        send_cmd(ser, "zplc config set mqtt_enabled 0", wait=0.5, max_read_s=2.0)
        send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0)
        # Drain any in-flight MQTT logs from before we disabled it
        collect_logs(ser, 2.0)
        print("[HIL] MQTT quiesced.")

        # ----------------------------------------------------------------
        # Wi-Fi setup
        # ----------------------------------------------------------------
        if not args.skip_wifi:
            if not args.wifi_ssid or not args.wifi_password:
                raise ValueError(
                    "Wi-Fi credentials missing. "
                    "Use --wifi-ssid/--wifi-password or env "
                    "ZPLC_WIFI_SSID/ZPLC_WIFI_PASSWORD."
                )
            print(f"[HIL] Connecting Wi-Fi to SSID: {args.wifi_ssid!r}")
            # -k 1 = WIFI_SECURITY_TYPE_PSK (WPA2-Personal / home router)
            # -k 2 = PSK-SHA256 which most ESP32 drivers reject → error -5
            wifi_out = send_cmd(
                ser,
                f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 1 -p {shell_quote(args.wifi_password)}",
                wait=5.0,
                max_read_s=12.0,
            )
            print(f"[HIL] Wi-Fi output ({len(wifi_out)} lines):")
            for ln in wifi_out[-10:]:
                print(f"      {ln}")

            # Wait for DHCP/association to complete before proceeding.
            # Zephyr Wi-Fi shell logs "Connected" on successful L2 association
            # and "Address:" when DHCP completes.
            # We give it up to 20s; if we don't see it we still continue —
            # Phase 2 can pass without network (DNS fail → mqtt_connect fail).
            if not any("Connected" in ln for ln in wifi_out):
                print("[HIL] Waiting for Wi-Fi association...")
                try:
                    assoc = wait_for_any_log(
                        ser,
                        ("Connected", "Address:", "WIFI_STATE_COMPLETED"),
                        timeout_s=20.0,
                    )
                    print(f"[HIL] Wi-Fi event: {assoc[-1]!r}")
                except AssertionError:
                    print(
                        "[HIL] WARNING: Wi-Fi association not confirmed — continuing anyway"
                    )

        # ----------------------------------------------------------------
        # Phase 1 — Cert upload flow
        # ----------------------------------------------------------------
        print("[HIL] Phase 1: cert upload")
        cert_pem = b"-----BEGIN CERTIFICATE-----\nMIIBFAKE\n-----END CERTIFICATE-----\n"
        cert_hex = cert_pem.hex()

        out = send_cmd(ser, "zplc cert begin ca %d" % len(cert_pem))
        assert_contains(out, "OK: Cert staging started")

        for i in range(0, len(cert_hex), 32):
            out = send_cmd(
                ser, f"zplc cert chunk {cert_hex[i : i + 32]}", 0.2, max_read_s=1.5
            )
            assert_contains(out, "OK: Cert chunk accepted")

        out = send_cmd(ser, "zplc cert commit")
        assert_contains(out, "OK: Certificate committed")

        out = send_cmd(ser, "zplc cert status")
        assert_contains(out, "OK: CA present")
        print("[HIL] Phase 1: PASS")

        # ----------------------------------------------------------------
        # Phase 2 — TLS server-verify MUST fail with invalid/fake CA
        # ----------------------------------------------------------------
        print("[HIL] Phase 2: TLS server-verify failure (security=2)")
        send_cmd(ser, "zplc config set mqtt_enabled 1")
        send_cmd(ser, "zplc config set mqtt_broker test.mosquitto.org")
        send_cmd(ser, "zplc config set mqtt_port 8883")
        send_cmd(ser, "zplc config set mqtt_security 2")
        send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0)

        # Reset MQTT backoff before Phase 2.
        #
        # Why: the MQTT thread uses exponential backoff (2s→4s→…→60s).
        # After even a single failed attempt the backoff can be >60s.
        # Toggling mqtt_enabled restarts the thread with backoff=2s,
        # making the test deterministic regardless of prior run history.
        #
        # For shell method (ESP32-S3 USB-JTAG): toggle mqtt_enabled.
        #   Closing the serial handle on macOS kills the CDC endpoint
        #   permanently until a physical reset — so we NEVER close it.
        # For openocd method (STM32/SWD): full SoC reboot + reconnect.
        if not args.no_reset_between_phases:
            if args.reboot_method == "openocd":
                print("[HIL] Rebooting (OpenOCD) to reset MQTT backoff for Phase 2...")
                ser = reboot_and_reconnect(
                    ser,
                    args.port,
                    args.baud,
                    args.reboot_method,
                    args.openocd_interface,
                    args.openocd_target,
                )
                wait_for_shell_ready(ser)
                if not args.skip_wifi:
                    print("[HIL] Re-connecting Wi-Fi after reboot...")
                    wifi_out = send_cmd(
                        ser,
                        f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 1 -p {shell_quote(args.wifi_password)}",
                        wait=5.0,
                        max_read_s=12.0,
                    )
                    if not any("Connected" in ln for ln in wifi_out):
                        try:
                            wait_for_any_log(
                                ser,
                                ("Connected", "Address:", "WIFI_STATE_COMPLETED"),
                                timeout_s=25.0,
                            )
                        except AssertionError:
                            print(
                                "[HIL] WARNING: Wi-Fi re-association not confirmed — continuing"
                            )
            else:
                print("[HIL] Resetting MQTT backoff for Phase 2 (firmware command)...")
                send_cmd(ser, "zplc mqtt reset_backoff")
                trigger_mqtt_reconnect(ser)
                collect_logs(ser, 1.0)  # drain any in-flight logs

        logs = wait_for_any_log(
            ser, _SECURITY_FAIL_NEEDLES, timeout_s=args.phase2_timeout
        )

        assert_contains_any(logs, _SECURITY_FAIL_NEEDLES)
        matched = [ln for ln in logs if any(n in ln for n in _SECURITY_FAIL_NEEDLES)]
        print(f"[HIL] Phase 2: PASS — matched: {matched[0]!r}")

        # ----------------------------------------------------------------
        # Phase 3 — TLS no-verify MUST bypass cert gate and attempt connect
        # ----------------------------------------------------------------
        print("[HIL] Phase 3: TLS no-verify connect attempt (security=1)")
        send_cmd(ser, "zplc config set mqtt_security 1")
        send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0)

        # Same rationale as Phase 2: reset MQTT backoff before Phase 3.
        if not args.no_reset_between_phases:
            if args.reboot_method == "openocd":
                print("[HIL] Rebooting (OpenOCD) to reset MQTT backoff for Phase 3...")
                ser = reboot_and_reconnect(
                    ser,
                    args.port,
                    args.baud,
                    args.reboot_method,
                    args.openocd_interface,
                    args.openocd_target,
                )
                wait_for_shell_ready(ser)
                if not args.skip_wifi:
                    print("[HIL] Re-connecting Wi-Fi after reboot...")
                    wifi_out = send_cmd(
                        ser,
                        f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 1 -p {shell_quote(args.wifi_password)}",
                        wait=5.0,
                        max_read_s=12.0,
                    )
                    if not any("Connected" in ln for ln in wifi_out):
                        try:
                            wait_for_any_log(
                                ser,
                                ("Connected", "Address:", "WIFI_STATE_COMPLETED"),
                                timeout_s=25.0,
                            )
                        except AssertionError:
                            print(
                                "[HIL] WARNING: Wi-Fi re-association not confirmed — continuing"
                            )
            else:
                print("[HIL] Resetting MQTT backoff for Phase 3 (firmware command)...")
                send_cmd(ser, "zplc mqtt reset_backoff")
                trigger_mqtt_reconnect(ser)
                collect_logs(ser, 1.0)

        logs = wait_for_any_log(
            ser, _CONNECT_ATTEMPT_NEEDLES, timeout_s=args.phase3_timeout
        )

        assert_not_contains_any(
            logs,
            (
                "MQTT security setup failed",
                "TLS CA file missing",
                "Mutual TLS requires cert+key",
            ),
        )
        assert_contains_any(logs, _CONNECT_ATTEMPT_NEEDLES)
        matched = [ln for ln in logs if any(n in ln for n in _CONNECT_ATTEMPT_NEEDLES)]
        print(f"[HIL] Phase 3: PASS — matched: {matched[0]!r}")

    finally:
        # ----------------------------------------------------------------
        # Restore board defaults for the next run
        # ----------------------------------------------------------------
        try:
            send_cmd(ser, "zplc config set mqtt_security 0")
            send_cmd(ser, "zplc config set mqtt_port 1883")
            send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0)
        except serial.SerialException:
            pass
        finally:
            try:
                # Deassert RTS/DTR before closing to avoid killing CDC endpoint
                ser.dtr = False
                ser.rts = False
                ser.close()
            except Exception:
                pass

    print("PASS: communication security HIL checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
