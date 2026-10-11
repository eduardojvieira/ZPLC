"""Reference projects of Studio on the device: the LD, FBD and SFC blinkies and the LD motor control (HIL-004, HIL-015).

Each project is compiled as a workspace by the repository compiler and run; the checks are what the project is for
(a blinker toggles its output, a motor circuit seals in and drops out), judged on values read while it runs.
Exits non-zero when one differs.
"""
from language_tester import LanguageTester
from zplc_tester import ROOT, cli

PROJECTS = str(ROOT / "packages/zplc-ide/projects")


def blinks(at="%QX0.0", scans=250):
    return [{"scans": scans, "expect": [{"at": at, "type": "BOOL", "op": "toggles", "min": 2}]}]


def cases():
    return [
        {"id": "examples.blinky_ld", "title": "Blinky (LD): the LED output toggles", "source": f"{PROJECTS}/blinky", "phases": blinks()},
        {"id": "examples.blinky_fbd", "title": "Blinky (FBD): the LED output toggles", "source": f"{PROJECTS}/blinky_fbd", "phases": blinks()},
        {"id": "examples.blinky_sfc", "title": "Blinky (SFC): the LED starts on and toggles", "source": f"{PROJECTS}/blinky_sfc", "phases": [
            {"scans": 3, "expect": [{"at": "%QX0.0", "type": "BOOL", "value": True}]},
            *blinks(),
        ]},
        {"id": "examples.motor_control", "title": "Motor control (LD): start seals in, overload drops out", "source": f"{PROJECTS}/motor_control", "phases": [
            {"scans": 5, "inputs": [{"at": "%IX0.0", "type": "BOOL", "value": False}],
             "expect": [{"at": "%QX0.0", "type": "BOOL", "value": False}, {"at": "%QX0.1", "type": "BOOL", "value": False}]},
            {"scans": 5, "inputs": [{"at": "%IX0.0", "type": "BOOL", "value": True}],
             "expect": [{"at": "%QX0.0", "type": "BOOL", "value": True}, {"at": "%QX0.1", "type": "BOOL", "value": True}]},
            {"scans": 5, "inputs": [{"at": "%IX0.0", "type": "BOOL", "value": False}],
             "expect": [{"at": "%QX0.0", "type": "BOOL", "value": True}]},
            {"scans": 5, "inputs": [{"at": "%IX0.2", "type": "BOOL", "value": True}],
             "expect": [{"at": "%QX0.0", "type": "BOOL", "value": False}]},
        ]},
    ]


def run_tests(tester=None):
    tester = tester or LanguageTester()
    for case in cases():
        try:
            problems = tester.run_fixture(case, scan_ms=10)
        except Exception as error:
            problems = [f"{type(error).__name__}: {error}"]
        tester.check(f"{case['id']}: {case['title']}", not problems, "; ".join(problems))
    tester.close()
    return tester.finish()


if __name__ == "__main__":
    cli(run_tests)
