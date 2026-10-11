"""Upload the pico_blinky project through the scheduler commands, start it and watch the output image for five seconds.

Exits non-zero when the program does not run or the output never changes (HIL-004).
"""
from zplc_tester import ZPLCTester, cli

PROJECT = "packages/zplc-ide/projects/pico_blinky"


def run(tester=None):
    tester = tester or ZPLCTester()
    bytecode = tester.compile_project(PROJECT)
    print("Uploading bytecode to the scheduler...")
    tester.send("zplc stop")
    loaded = "OK:" in tester.send(f"zplc sched load {len(bytecode)}", wait_for="OK:")
    hex_data = bytes(bytecode).hex()
    for at in range(0, len(hex_data), 64):
        loaded = loaded and "OK:" in tester.send(f"zplc sched data {hex_data[at : at + 64]}", wait_for="OK:")
    tester.check("the program is accepted", loaded)
    tester.send("zplc start")
    states = []
    for _ in range(5):
        states.append(tuple(tester.peek(0x1000, 2)))
        tester.sleep(1.0)
    print("Output image while it runs:", states)
    tester.check("the output image has data", all(len(state) == 2 for state in states))
    tester.check("the output changes while it runs", len(set(states)) > 1, f"saw only {set(states)}")
    tester.send("zplc stop")
    tester.close()
    return tester.finish()


if __name__ == "__main__":
    cli(run)
