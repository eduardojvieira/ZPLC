import sys
import os
import time
import importlib.util

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


def run_suite(module_path, suite_name):
    print(f"\n>>> Running Suite: {suite_name}...")
    try:
        spec = importlib.util.spec_from_file_location("module.name", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if hasattr(module, "run_tests"):
            return module.run_tests()
        else:
            print(f"⚠️  Module {suite_name} has no run_tests() function.")
            return False
    except Exception as e:
        print(f"❌ ERROR in {suite_name}: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    print("====================================================")
    print("       ZPLC MULTI-LANGUAGE HIL TEST RUNNER          ")
    print("====================================================")
    print(f"Started at: {time.ctime()}")

    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Order matters: simpler languages first
    potential_suites = [
        ("test_il_suite.py", "IL (Instruction List)"),
        ("test_ld_suite.py", "LD (Ladder Diagram)"),
        ("test_fbd_suite.py", "FBD (Function Block Diagram)"),
        ("test_sfc_suite.py", "SFC (Sequential Function Chart)"),
        ("test_examples_suite.py", "Integration Examples (Blinky/Motor)"),
    ]

    active_suites = []
    for fname, name in potential_suites:
        fpath = os.path.join(base_dir, fname)
        if os.path.exists(fpath):
            active_suites.append((fpath, name))

    if not active_suites:
        print("No test suites found! (Create test_*_suite.py files)")
        sys.exit(0)

    results = []
    for fpath, name in active_suites:
        success = run_suite(fpath, name)
        results.append((name, success))

    print("\n\n====================================================")
    print("                FINAL REPORT                        ")
    print("====================================================")
    all_pass = True
    for name, success in results:
        status = "SUCCESS ✅" if success else "FAILED ❌"
        print(f"{name:<30} : {status}")
        if not success:
            all_pass = False

    print("====================================================")
    if all_pass:
        print("ALL SUITES PASSED! 🚀")
        sys.exit(0)
    else:
        print("SOME SUITES FAILED! 💀")
        sys.exit(1)


if __name__ == "__main__":
    main()
