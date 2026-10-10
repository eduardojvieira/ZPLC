#!/usr/bin/env python3
"""Link-level check of the authority of inbound messages (COM-017).

    check_inbound_authority.py <build-dir> [<build-dir> ...]

A message that arrives from Modbus, MQTT or a cloud service may not change RUN/STOP, set or clear a force, or
download a program. The sources that handle those messages are listed in INBOUND below; this script reads the
object files of a firmware build (a `west build` tree of firmware/app) and lists the symbols each one leaves
undefined, with the `nm` of the toolchain that built it. Two things fail the check:

  - an inbound object that references one of the entry points of the runtime that start, stop, force or load,
    or that reboots the device (AUTHORITY);
  - an inbound object that reaches PLC memory other than through the exchange (RT-010): the live region, the
    image lock or the force-aware write of the core (DIRECT_IMAGE). The exchange queues what comes from outside
    and the scan applies it at its next input latch, so a server that went round it would write in the middle
    of a scan.

The exchange itself (EXCHANGE) is checked against the first list as well: it applies the queued writes through
the force-aware interface of the core and through nothing else, so it must not reference run control, the force
table or the loader either.

The check is on the compiled objects of the real image of every board: an inbound handler that was handed the
scheduler (or the program store) cannot link without naming it, and this is where the name shows. It
complements the behavioural test of firmware/tests/inbound_authority, which drives hostile Modbus frames
through the product's framing and mapping in front of a core whose authority entries count their calls.

A build tree in which no inbound object is found fails: a check that looks at nothing must not pass.
"""

import re
import subprocess
import sys
from pathlib import Path

#: Sources of firmware/app that act on what arrives from the network.
INBOUND = (
    "zplc_mqtt",
    "zplc_mqtt_command",
    "zplc_modbus",
    "zplc_modbus_tcp",
    "zplc_modbus_client",
    "zplc_comm_modbus_handler",
    "zplc_comm_mqtt_handler",
    "zplc_comm_cloud_handler",
    "zplc_azure_dps",
    "zplc_azure_sas",
    "zplc_aws_fleet",
    "zplc_tls_credentials",
)

#: The sources of the core that apply what the inbound ones queue.
EXCHANGE = ("zplc_exchange",)

#: What a message must not be able to call: RUN/STOP and the run control, the force table, loading a program,
#: the program store, and a reboot.
AUTHORITY = re.compile(
    r"^(?:"
    r"zplc_sched_(?:start|stop|pause|resume|step|load|register_task|unregister_task|enter_safe_error|shutdown|init|"
    r"validate_program|debug_[a-z_]+)"
    r"|zplc_force_(?:set_bytes|clear|clear_all)"
    r"|zplc_core_(?:load|load_tasks|init|cold_start|shutdown|step|run|run_cycle)"
    r"|zplc_vm_(?:init|set_entry|step|run|run_bounded|run_cycle|reset_cycle|resume|add_breakpoint|"
    r"remove_breakpoint|clear_breakpoints)"
    r"|zplc_program_[a-z_]+"
    r"|zplc_loader_[a-z_]+"
    r"|zplc_boot_restore[a-z_]*"
    r"|sys_reboot|sys_arch_reboot|z_impl_sys_reboot"
    r")$"
)

#: The ways round the exchange into PLC memory. The exchange itself may use zplc_force_write_bytes: that is what
#: it applies a queued write with.
DIRECT_IMAGE = re.compile(r"^(?:zplc_force_write_bytes|zplc_mem_get_region|zplc_pi_lock|zplc_pi_unlock)$")

FORBIDDEN = AUTHORITY  # the name the first version of this file exported


def nm_of(build: Path, override: str | None) -> str:
    if override:
        return override
    cache = build / "CMakeCache.txt"
    if cache.is_file():
        match = re.search(r"^CMAKE_NM:FILEPATH=(.+)$", cache.read_text(errors="replace"), re.MULTILINE)
        if match:
            return match.group(1).strip()
    return "nm"


def objects_of(build: Path, names: tuple[str, ...]) -> list[Path]:
    wanted = {f"{name}.c.obj" for name in names} | {f"{name}.c.o" for name in names}
    return sorted(p for p in build.rglob("*") if p.name in wanted and p.is_file())


def inbound_objects(build: Path) -> list[Path]:
    return objects_of(build, INBOUND)


def undefined_symbols(nm: str, obj: Path) -> list[str]:
    done = subprocess.run([nm, "--undefined-only", "--format=posix", str(obj)], capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(f"{nm} failed on {obj}: {done.stderr.strip()}")
    return [line.split()[0] for line in done.stdout.splitlines() if line.strip()]


def check_build(build: Path, nm_override: str | None = None) -> tuple[int, list[tuple[str, str]]]:
    """Returns the number of objects looked at and the (object, symbol) pairs that are forbidden.

    The inbound objects may reference neither AUTHORITY nor DIRECT_IMAGE; the exchange may not reference AUTHORITY.
    A build that has an inbound object and no exchange object fails too: the exchange is what the inbound
    sources write through, so a tree without it was not built from this source.
    """
    nm = nm_of(build, nm_override)
    inbound = inbound_objects(build)
    exchange = objects_of(build, EXCHANGE)
    violations = []
    for obj in inbound:
        for symbol in undefined_symbols(nm, obj):
            if AUTHORITY.match(symbol) or DIRECT_IMAGE.match(symbol):
                violations.append((obj.name, symbol))
    for obj in exchange:
        for symbol in undefined_symbols(nm, obj):
            if AUTHORITY.match(symbol):
                violations.append((obj.name, symbol))
    if inbound and not exchange:
        violations.append(("zplc_exchange.c.obj", "(object file not found: the exchange is not in this build)"))
    return len(inbound) + len(exchange), violations


def main(argv: list[str]) -> int:
    builds = [a for a in argv if not a.startswith("--nm=")]
    nm_override = next((a.split("=", 1)[1] for a in argv if a.startswith("--nm=")), None)
    if not builds:
        print(__doc__, file=sys.stderr)
        return 2
    status = 0
    for name in builds:
        build = Path(name)
        label = build.name
        try:
            count, violations = check_build(build, nm_override)
        except (OSError, RuntimeError) as error:
            print(f"FAIL inbound-authority {label}: {error}")
            status = 1
            continue
        if count == 0:
            print(f"FAIL inbound-authority {label}: no inbound object file found in {build}")
            status = 1
        elif violations:
            for obj, symbol in violations:
                print(f"FAIL inbound-authority {label}: {obj} references {symbol}")
            status = 1
        else:
            print(f"PASS inbound-authority {label}: {count} objects (inbound handlers and the exchange), none "
                  "references run control, forces, program load or reboot, and the handlers reach PLC memory "
                  "through the exchange only")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
