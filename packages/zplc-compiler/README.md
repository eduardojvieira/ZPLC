# @zplc/compiler

IEC 61131-3 Structured Text compiler that generates bytecode for the ZPLC runtime.

## Features

- **Full ST Support**: Variables, arrays, structs, functions, function blocks
- **Standard Library**: TON, TOF, TP, CTU, CTD, RS, SR, and more
- **Multi-task**: Compile multiple programs with task scheduling
- **Debug Maps**: Source-level debugging support
- **Zero Dependencies**: Pure TypeScript, works with Node.js or Bun

## Installation

```bash
npm install @zplc/compiler
# or
bun add @zplc/compiler
```

## Quick Start

```typescript
import { compileToBinary, compileST } from '@zplc/compiler';

const source = `
PROGRAM Blinky
VAR
    led : BOOL := FALSE;
    timer : TON;
END_VAR
    timer(IN := NOT timer.Q, PT := T#500ms);
    IF timer.Q THEN
        led := NOT led;
    END_IF;
END_PROGRAM
`;

// Get assembly output (for debugging)
const assembly = compileST(source);
console.log(assembly);

// Get binary output
const result = compileToBinary(source);
console.log('Bytecode size:', result.codeSize, 'bytes');

// Save as .zplc file
import { writeFileSync } from 'fs';
writeFileSync('program.zplc', result.zplcFile);
```

## API

### `compileST(source: string, options?: CodeGenOptions): string`

Compiles ST source to assembly text.

### `compileToBinary(source: string, options?: CompileOptions): CompilationResult`

Compiles ST source to bytecode.

```typescript
interface CompilationResult {
  assembly: string;        // Generated assembly
  bytecode: Uint8Array;    // Raw bytecode
  zplcFile: Uint8Array;    // Complete .zplc file with headers
  entryPoint: number;      // Entry point address
  codeSize: number;        // Code size in bytes
  debugMap?: DebugMap;     // Source-level debug info (optional)
}
```

### `compileSingleFileWithTask(source: string, options?: SingleFileTaskOptions): CompilationResult & { tasks: TaskDef[] }`

Compiles a single file with automatic task generation for the scheduler.

### `compileMultiTaskProject(config: ProjectConfig, sources: ProgramSource[]): MultiTaskCompilationResult`

Compiles multiple programs into a single .zplc file with task definitions.

## Supported Language Features

### Data Types
- `BOOL`, `BYTE`, `SINT`, `USINT`
- `INT`, `UINT`, `WORD`
- `DINT`, `UDINT`, `DWORD`
- `REAL`, `LREAL`
- `TIME`, `STRING`
- Arrays: `ARRAY[1..10] OF INT`
- Structs: `TYPE ... END_TYPE`

### Statements
- Assignment: `:=`
- IF/ELSIF/ELSE/END_IF
- CASE/OF/END_CASE
- FOR/TO/BY/DO/END_FOR
- WHILE/DO/END_WHILE
- REPEAT/UNTIL/END_REPEAT
- Function calls
- Function block instances

### Operators
- Arithmetic: `+`, `-`, `*`, `/`, `MOD`
- Comparison: `=`, `<>`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `XOR`, `NOT`
- Bitwise: `AND`, `OR`, `XOR`, `NOT`, `SHL`, `SHR`

### Standard Library

**Timers**: TON, TOF, TP  
**Counters**: CTU, CTD, CTUD  
**Bistables**: RS, SR  
**Edge Detection**: R_TRIG, F_TRIG  
**Math**: ABS, SQRT, MIN, MAX, LIMIT  
**Type Conversion**: INT_TO_REAL, REAL_TO_INT, etc.

## I/O Mapping

Use AT directives for hardware I/O:

```
VAR
    button AT %IX0.0 : BOOL;     (* Digital input *)
    led AT %QX0.0 : BOOL;        (* Digital output *)
    sensor AT %IW0 : INT;        (* Analog input *)
    valve AT %QW0 : INT;         (* Analog output *)
END_VAR
```

## License

MIT
