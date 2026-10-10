#!/usr/bin/env python3
"""Link-level check of the authority of inbound messages (COM-017).

    check_inbound_authority.py <build-dir> [<build-dir> ...]

A message that arrives from Modbus, MQTT or a cloud service may not change RUN/STOP, set or clear a force, or
download a program. The sources that handle those messages are listed in INBOUND below; this script reads the
object files of a firmware build (a `west build` tree of firmware/app) and lists the symbols each one leaves
undefined, with the `nm` of the toolchain that built it. An object that references one of the entry points of
the runtime that start, stop, force or load, or that reboots the device, fails the check.

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

#: What a message must not be able to call: RUN/STOP and the run control, the force table, loading a program,
#: the program store, and a reboot. Reading and writing process data (zplc_force_write_bytes, zplc_mem_get_region)
#: is the data path of the tags and is not listed.
FORBIDDEN = re.compile(
    r"^(?:"
    r"zplc_sched_(?:start|stop|pause|resume|step|load|register_task|unregister_task|enter_safe_error|shutdown|init|"
    r"validate_program|debug_[a-z_]+)"
    r"|zplc_force_(?:set_bytes|clear|clear_all)"
    r"|zplc_core_(?:load|load_tasks|init|shutdown|step|run|run_cycle)"
    r"|zplc_vm_(?:init|set_entry|step|run|run_bounded|run_cycle|reset_cycle|resume|add_breakpoint|"
    r"remove_breakpoint|clear_breakpoints)"
    r"|zplc_program_[a-z_]+"
    r"|zplc_loader_[a-z_]+"
    r"|zplc_boot_restore[a-z_]*"
    r"|sys_reboot|sys_arch_reboot|z_impl_sys_reboot"
    r")$"
)


def nm_of(build: Path, override: str | None) -> str:
    if override:
        return override
    cache = build / "CMakeCache.txt"
    if cache.is_file():
        match = re.search(r"^CMAKE_NM:FILEPATH=(.+)$", cache.read_text(errors="replace"), re.MULTILINE)
        if match:
            return match.group(1).strip()
    return "nm"


def inbound_objects(build: Path) -> list[Path]:
    wanted = {f"{name}.c.obj" for name in INBOUND} | {f"{name}.c.o" for name in INBOUND}
    return sorted(p for p in build.rglob("*") if p.name in wanted and p.is_file())


def undefined_symbols(nm: str, obj: Path) -> list[str]:
    done = subprocess.run([nm, "--undefined-only", "--format=posix", str(obj)], capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(f"{nm} failed on {obj}: {done.stderr.strip()}")
    return [line.split()[0] for line in done.stdout.splitlines() if line.strip()]


def check_build(build: Path, nm_override: str | None = None) -> tuple[int, list[tuple[str, str]]]:
    """Returns the number of inbound objects looked at and the (object, symbol) pairs that are forbidden."""
    nm = nm_of(build, nm_override)
    objects = inbound_objects(build)
    violations = []
    for obj in objects:
        for symbol in undefined_symbols(nm, obj):
            if FORBIDDEN.match(symbol):
                violations.append((obj.name, symbol))
    return len(objects), violations


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
            print(f"PASS inbound-authority {label}: {count} inbound objects, none references run control, forces, "
                  "program load or reboot")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
