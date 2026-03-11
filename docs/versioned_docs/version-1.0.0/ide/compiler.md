# ST Compiler

The ZPLC Structured Text compiler transforms IEC 61131-3 ST source code into optimized bytecode for the ZPLC Virtual Machine. The compiler is written in TypeScript and runs entirely in the browser.

## Compilation Pipeline

```mermaid
graph LR
    A[ST Source] --> B[Lexer]
    B --> C[Parser]
    C --> D[AST]
    D --> E[Semantic Analysis]
    E --> F[IR Generation]
    F --> G[Optimization]
    G --> H[Code Generation]
    H --> I[.zplc Binary]
```

### 1. Lexical Analysis (Lexer)

The lexer tokenizes the ST source code into a stream of tokens:

```
Input:  IF counter > 10 THEN motor := TRUE; END_IF;

Tokens: [IF] [IDENT:counter] [GT] [INT:10] [THEN] 
        [IDENT:motor] [ASSIGN] [TRUE] [SEMI] [END_IF] [SEMI]
```

### 2. Parsing

The parser builds an Abstract Syntax Tree (AST) from the token stream using a recursive descent parser.

**Supported Constructs:**
- Variable declarations (`VAR`, `VAR_INPUT`, `VAR_OUTPUT`, `VAR_RETAIN`)
- Assignments
- IF/THEN/ELSIF/ELSE/END_IF
- CASE/OF/END_CASE
- FOR/TO/BY/DO/END_FOR
- WHILE/DO/END_WHILE
- REPEAT/UNTIL/END_REPEAT
- Function calls
- Function block instantiation

### 3. Semantic Analysis

Type checking and scope resolution:

- Verify all variables are declared
- Check type compatibility in assignments and expressions
- Resolve function block instance methods
- Validate array bounds (when possible)

### 4. IR Generation

The AST is lowered to an intermediate representation closer to the bytecode:

```
ST:  result := a + b * c;

IR:  LOAD a
     LOAD b
     LOAD c
     MUL
     ADD
     STORE result
```

### 5. Optimization

Current optimizations:
- **Constant folding**: `2 + 3` → `5`
- **Dead code elimination**: Remove unreachable code
- **Peephole optimization**: `PUSH 0; ADD` → (removed)

### 6. Code Generation

The IR is serialized to ZPLC bytecode in the `.zplc` binary format.

---

## Language Support

### Data Types

| Type | Description | Example |
|------|-------------|---------|
| BOOL | Boolean | `TRUE`, `FALSE` |
| INT | 16-bit signed | `-32768` to `32767` |
| DINT | 32-bit signed | `-2147483648` to `2147483647` |
| REAL | 32-bit float | `3.14159` |
| TIME | Duration | `T#5s`, `T#100ms` |
| STRING | Text (80 chars default) | `'Hello'` |
| STRING[n] | Text with capacity n | `'Hello'` (max n chars) |

### STRING Type Details

Strings in ZPLC follow the IEC 61131-3 specification with bounded buffers for safety.

#### Declaration

```st
VAR
    message : STRING;           (* Default: 80 char capacity *)
    short_msg : STRING[20];     (* Custom: 20 char capacity *)
    initialized : STRING := 'Hello World';
END_VAR
```

#### Memory Layout

Each STRING variable occupies a fixed buffer in work memory:

```
┌───────────────┬───────────────┬──────────────────────┐
│ current_len   │ max_capacity  │      data[]          │
│   (2 bytes)   │   (2 bytes)   │  (max_capacity + 1)  │
└───────────────┴───────────────┴──────────────────────┘
```

- **current_len**: Number of characters currently stored
- **max_capacity**: Maximum allowed characters (from declaration)
- **data[]**: Character bytes + null terminator

Total size: 4 + capacity + 1 = 85 bytes for `STRING[80]`

#### String Literals

String literals use single quotes with `''` for escaped quotes:

```st
msg := 'Hello World';      (* Simple string *)
msg := 'It''s working';    (* Escaped quote → It's working *)
msg := '';                 (* Empty string *)
```

#### String Operations

The compiler automatically handles string operations:

```st
(* Comparison - uses STRCMP opcode *)
IF status = 'OK' THEN
    (* ... *)
END_IF;

IF error <> 'NONE' THEN
    (* ... *)
END_IF;

(* Function calls *)
len := LEN(message);
CONCAT(message, ' World');
COPY(source, destination);
```

#### Code Generation

String literals are allocated in a pool during compilation:

1. **Collection Phase**: All string literals in the AST are gathered
2. **Allocation Phase**: Unique addresses assigned after declared variables
3. **Initialization Phase**: Startup code stores length, capacity, and characters

Example generated code for `msg := 'Hi'`:
```asm
; Initialize literal '_str0' at 0x2055
PUSH16 2           ; length = 2
STORE16 0x2055     ; store at offset 0
PUSH16 2           ; capacity = 2
STORE16 0x2057     ; store at offset 2
PUSH8 72           ; 'H'
STORE8 0x2059      ; data[0]
PUSH8 105          ; 'i'
STORE8 0x205a      ; data[1]
PUSH8 0            ; null terminator
STORE8 0x205b      ; data[2]

; Assignment: copy literal to variable
PUSH16 0x2000      ; &msg (destination)
PUSH16 0x2055      ; &'Hi' (source)
STRCPY
```

#### String Functions

See the [Standard Library Reference](/docs/runtime/stdlib#7-string-functions) for the complete list of string functions including:

- **Basic**: `LEN`, `CONCAT`, `COPY`, `CLEAR`
- **Substring**: `LEFT`, `RIGHT`, `MID`
- **Search**: `FIND`, `INSERT`, `DELETE`, `REPLACE`
- **Comparison**: `STRCMP`, `EQ_STRING`, `NE_STRING`

### Operators

| Category | Operators |
|----------|-----------|
| Arithmetic | `+`, `-`, `*`, `/`, `MOD` |
| Comparison | `=`, `<>`, `<`, `<=`, `>`, `>=` |
| Logical | `AND`, `OR`, `XOR`, `NOT` |
| Bitwise | `AND`, `OR`, `XOR`, `NOT`, `SHL`, `SHR` |

### Control Structures

```st
// Conditional
IF condition THEN
    // statements
ELSIF other_condition THEN
    // statements  
ELSE
    // statements
END_IF;

// Case selection
CASE selector OF
    1: action1();
    2, 3: action2();
    ELSE: default_action();
END_CASE;

// Counted loop
FOR i := 1 TO 10 BY 1 DO
    // statements
END_FOR;

// While loop
WHILE condition DO
    // statements
END_WHILE;

// Repeat loop
REPEAT
    // statements
UNTIL condition
END_REPEAT;
```

---

## Function Blocks

### Using Standard FBs

```st
VAR
    start_delay : TON;  // Instance of TON timer
    motor_running : BOOL;
END_VAR

// Call the FB
start_delay(IN := start_button, PT := T#2s);

// Access outputs
motor_running := start_delay.Q;
```

### Defining Custom FBs

```st
FUNCTION_BLOCK Hysteresis
VAR_INPUT
    input_val : REAL;
    high_limit : REAL;
    low_limit : REAL;
END_VAR
VAR_OUTPUT
    output : BOOL;
END_VAR
VAR
    state : BOOL;
END_VAR

IF input_val >= high_limit THEN
    state := TRUE;
ELSIF input_val <= low_limit THEN
    state := FALSE;
END_IF;

output := state;

END_FUNCTION_BLOCK
```

---

## Compiler Messages

### Error Format

```
ERROR: [line:col] message
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Undeclared identifier 'x'` | Variable not in VAR block | Add declaration |
| `Type mismatch: BOOL vs INT` | Incompatible assignment | Use type conversion |
| `Function 'foo' not found` | Missing FB or function | Check spelling/import |
| `Expected ';'` | Missing statement terminator | Add semicolon |

### Warnings

- Unused variables
- Unreachable code
- Implicit type conversions

---

## Compiler Options

| Option | Description |
|--------|-------------|
| `--optimize` | Enable all optimizations |
| `--debug` | Include debug symbols |
| `--strict` | Treat warnings as errors |
| `--target <version>` | Target VM version |

---

## Output: The .zplc File

The compiler produces a binary package containing:

1. **Header**: Magic number, version, CRC32
2. **Code Segment**: Bytecode instructions
3. **Data Segment**: Constants and initial values
4. **Symbol Table**: Variable names and addresses (optional)
5. **Debug Info**: Source line mapping (optional)

File size is typically 1-10 KB for most programs.
