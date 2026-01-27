import os
import sys
import glob


def compile_file(filepath):
    """Compiles a single file using the ZPLC CLI."""
    print(f"[{filepath}] Compiling...", end=" ")

    # Resolve CLI path
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    cli_path = os.path.join(root_dir, "packages/zplc-ide/src/cli/index.ts")

    # Output path
    base, _ = os.path.splitext(filepath)
    if filepath.endswith(".json"):
        # Remove .ld, .fbd, .sfc intermediate extension if present
        base, _ = os.path.splitext(base)

    output_bin = base + ".zplc"

    # Command
    cmd = f"bun {cli_path} compile {filepath} -o {output_bin}"

    result = os.system(cmd + " > /dev/null 2>&1")

    if result == 0:
        print("OK ✅")
        return True
    else:
        print("FAIL ❌")
        # Run again to show error
        os.system(cmd)
        return False


def main():
    print("====================================================")
    print("       ZPLC COMPILATION DRY-RUN CHECK               ")
    print("====================================================")

    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Patterns to check
    patterns = [
        "il_tests/*.il",
        "ld_tests/*.json",
        "fbd_tests/*.json",
        "sfc_tests/*.json",
        "../../packages/zplc-ide/src/examples/*.json",
    ]

    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(base_dir, p)))

    success_count = 0
    fail_count = 0

    for f in files:
        if compile_file(f):
            success_count += 1
        else:
            fail_count += 1

    print("\n====================================================")
    print(f"Summary: {success_count} Passed, {fail_count} Failed")

    if fail_count > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
