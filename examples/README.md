# VM assembly fixtures

These files are test fixtures for the ZPLC virtual machine and its assembler.
They are **not** PLC example programs. If you are looking for programs to open in
Studio, they are in [`packages/zplc-ide/projects/`](../packages/zplc-ide/projects/):
tank level, conveyor, motor start and stop, pedestrian crossing, blinkers for each
language and more. Studio copies one to a folder you choose.

## What is here

Each fixture is a pair: a hand-written `.asm` source and the `.zplc` binary
assembled from it.

| Fixture               | What it exercises                |
| --------------------- | -------------------------------- |
| `01_hello`            | The smallest program the VM runs |
| `02_addition`         | Integer addition, `C = A + B`    |
| `03_conditional`      | Conditional jumps                |
| `04_loop`             | A counter loop                   |
| `05_function_call`    | `CALL` and `RET`                 |
| `06_bitwise`          | Bitwise operations               |
| `07_stack_ops`        | Stack manipulation               |
| `08_float_math`       | `REAL` arithmetic                |
| `09_type_conversions` | Conversions between types        |
| `10_64bit_operations` | 64-bit operations                |

## Who uses them

- `firmware/lib/zplc_core/tests/test_vm_core.c` loads `02_addition.zplc` and
  `08_float_math.zplc` from this directory. CTest runs it from the repository
  root for that reason, so this directory has to stay at the root.
- The binary-contract tools in `tools/contract/` check every `*.zplc` here: the
  CRC cross-check between C and TypeScript, and the draft-counter verdicts.

## Rebuilding

After a change to the binary contract, assemble each fixture again and commit the
result with the contract change:

```bash
python3 tools/zplc_asm.py examples/02_addition.asm -o examples/02_addition.zplc
```

The procedure is in
[Changing the binary contract](../docs/docs/contributing/index.md#changing-the-binary-contract).
