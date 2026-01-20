# AGENTS.md - Context for AI Agents & Contributors

This file provides essential context for AI coding agents working on ZPLC.

## Project Overview

| Field | Value |
|-------|-------|
| **Name** | ZPLC (Zephyr PLC) |
| **Goal** | Open-source IEC 61131-3 PLC runtime |
| **Primary Target** | Zephyr RTOS |
| **Core Language** | ANSI C99 (strict) |
| **IDE Language** | TypeScript + React |
| **Version** | v1.4.x |

## Build & Test Commands

### C Runtime (POSIX)

```bash
# Build (from firmware/lib/zplc_core)
cd firmware/lib/zplc_core
mkdir build && cd build
cmake .. && make

# Run all tests
ctest --output-on-failure

# Run a single test
./test_vm_core          # VM core tests
./test_isa              # ISA tests

# Clean rebuild
rm -rf build && mkdir build && cd build && cmake .. && make
```

### TypeScript IDE

```bash
cd ide

bun install             # Install dependencies
bun test                # Run all tests
bun test compiler.test.ts           # Single test file
bun test --test-name-pattern "tok"  # Pattern match
bun test --watch        # Watch mode
bun run lint            # Lint
bun run dev             # Dev server
bun run build           # Production build
```

### Zephyr Build

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject
west build -b mps2/an385 $ZEPLC_PATH/firmware/app --pristine   # QEMU
west build -b rpi_pico $ZEPLC_PATH/firmware/app --pristine     # Pico
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/                   # Flash
```

---

## Code Style Guidelines

### C Code (firmware/lib/zplc_core/)

- **Standard**: ANSI C99 strict (`-std=c99 -pedantic -Werror`)
- **Indentation**: 4 spaces (no tabs)
- **Line length**: 80 soft, 100 hard
- **Braces**: Opening on same line

**Naming:**
```c
zplc_core_init();              // Functions: snake_case, zplc_ prefix
static int local_counter;      // Variables: snake_case
#define ZPLC_MEM_SIZE 4096     // Macros: UPPER_CASE, ZPLC_ prefix
typedef struct zplc_vm zplc_vm_t;  // Types: snake_case_t
```

**Documentation:**
```c
/**
 * @brief Function description.
 * @param name Parameter description.
 * @return Return value description.
 */
int zplc_function(int name);
```

**Error Handling:**
```c
zplc_result_t result = zplc_core_load(data, size);
if (result != ZPLC_OK) return result;  // Propagate errors
```

**Memory Rules:**
- No dynamic allocation (`malloc`/`free`) in core
- All memory statically allocated
- Bounds check all array accesses

### TypeScript Code (ide/src/)

- **Target**: ES2022, strict mode
- **Module**: ESNext with bundler resolution

**Imports:**
```typescript
import type { ASTNode, Expression } from './ast.ts';  // Type imports
import { tokenize, TokenType } from './lexer.ts';     // Include .ts extension
```

**Naming:**
```typescript
function compileProject(): CompileResult { }  // camelCase functions
interface CompileResult { }                   // PascalCase types
const WORK_MEMORY_SIZE = 256;                 // UPPER_CASE constants
enum TokenType { Identifier, IntLiteral }     // PascalCase enums
```

**Error Handling:**
```typescript
export class ParseError extends Error {
    constructor(message: string, public line: number, public column: number) {
        super(`${message} at line ${line}, column ${column}`);
        this.name = 'ParseError';
    }
}
```

**Testing:**
```typescript
import { describe, it, expect } from 'bun:test';

describe('Lexer', () => {
    it('tokenizes keywords', () => {
        const tokens = tokenize('PROGRAM Test END_PROGRAM');
        expect(tokens[0].type).toBe(TokenType.PROGRAM);
    });
});
```

---

## Architecture

### HAL Abstraction (Critical)

The core VM **never** accesses hardware directly:

```c
// Good: Use HAL
uint32_t now = zplc_hal_tick();
zplc_hal_gpio_write(channel, value);

// Bad: Direct hardware (NEVER in src/core/)
GPIO->ODR |= (1 << pin);
```

### Memory Map

| Region | Address | Size | Purpose |
|--------|---------|------|---------|
| IPI | 0x0000 | 4 KB | Inputs (read-only) |
| OPI | 0x1000 | 4 KB | Outputs |
| Work | 0x2000 | 8 KB | Variables |
| Retain | 0x4000 | 4 KB | Persistent |
| Code | 0x5000 | 44 KB | Bytecode |

---

## Directory Structure

```
ZPLC/
├── firmware/                      # Standalone Zephyr project
│   ├── app/                       # Zephyr application (main target)
│   │   ├── src/main.c
│   │   ├── src/shell_cmds.c
│   │   ├── boards/                # Board overlays & configs
│   │   └── prj.conf
│   ├── apps/posix_host/           # POSIX development runtime
│   ├── lib/zplc_core/             # Core library (C99)
│   │   ├── include/               # Public headers
│   │   ├── src/core/              # VM implementation
│   │   ├── src/hal/               # HAL implementations
│   │   └── tests/                 # C unit tests
│   ├── CMakeLists.txt             # Zephyr module CMake
│   ├── Kconfig                    # Zephyr Kconfig
│   └── module.yml                 # Zephyr module definition
├── ide/                           # Web/Desktop IDE
│   ├── src/compiler/              # ST compiler (TypeScript)
│   ├── src/components/            # React UI
│   └── electron/                  # Desktop app
└── docs/                          # Documentation
```

---

## Key Files

| File | Purpose |
|------|---------|
| `firmware/lib/zplc_core/src/core/zplc_core.c` | VM interpreter |
| `firmware/lib/zplc_core/include/zplc_isa.h` | Opcode definitions (75 opcodes) |
| `firmware/app/src/shell_cmds.c` | Serial shell commands |
| `ide/src/compiler/index.ts` | Compiler entry point |
| `ide/src/compiler/codegen.ts` | Bytecode generation |
| `ide/src/compiler/parser.ts` | ST parser |
| `firmware/lib/zplc_core/tests/test_vm_core.c` | VM tests |

---

## Common Tasks

### Adding a New Opcode

1. Define in `firmware/lib/zplc_core/include/zplc_isa.h`: `#define OP_NEW 0xNN`
2. Implement in `firmware/lib/zplc_core/src/core/zplc_core.c`
3. Add test in `firmware/lib/zplc_core/tests/test_vm_core.c`
4. Add compiler support in `ide/src/compiler/codegen.ts`

### Adding a Stdlib Function

1. Create/edit in `ide/src/compiler/stdlib/`
2. Register in `ide/src/compiler/stdlib/index.ts`
3. Add tests in `ide/src/compiler/functions.test.ts`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "POSIX only works on Linux" | Use QEMU: `west build -b mps2/an385` |
| Compiler warnings as errors | Fix warnings, don't disable `-Werror` |
| LSP errors with Zephyr headers | Ignore - Zephyr provides at build time |

---

## Commit Guidelines

- Prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Run before commit:
  ```bash
  cd firmware/lib/zplc_core/build && make && ctest
  cd ../../../ide && bun test
  ```

## Environment

| Component | Location |
|-----------|----------|
| Zephyr Workspace | `~/zephyrproject` |
| Zephyr SDK | `~/zephyr-sdk-0.17.0` |
| Activation | `source ~/zephyrproject/activate.sh` |

macOS tools: `brew install cmake ninja gperf python3 ccache qemu dtc`
