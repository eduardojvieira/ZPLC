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
| STRING | Text (limited) | `'Hello'` |

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
