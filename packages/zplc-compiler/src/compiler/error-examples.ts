/**
 * One build that provokes each error code (CMP-006)
 *
 * SPDX-License-Identifier: MIT
 *
 * For each code of `error-codes.ts` that a source can provoke, a program (or a project) and what the first error of its
 * build must report: the code (the key), the line, the column, the file and the message. `error-codes.test.ts` builds each
 * of them and compares; `tools/docs/generate_diagnostic_codes.ts` prints them on the reference page, so the page shows what
 * the compiler does, not what somebody remembers it did.
 *
 * The position is the one of the first error, 1-based. The message is the `detail` of the error: what a build of one
 * program file inside a project says, which for a syntax error begins with the name of the file read.
 *
 * Codes that are not here are provoked by a unit test of their own, which `error-codes.test.ts` lists.
 */

import type { CompilerMemoryProfile } from './codegen.ts';
import type { ErrorCode } from './error-codes.ts';

export interface ErrorExample {
    /** The text of the program `Main`, which the one task of the project runs. */
    source?: string;
    /** The files of a project by program name, when one program is not enough. */
    files?: Readonly<Record<string, string>>;
    /** The safe values of the outputs that the project declares (RT-023). */
    safeOutputs?: ReadonlyArray<{ offset: number; bit: number; value: 0 | 1 }>;
    /** The tasks of the project; the default is one cyclic task that runs `Main`. */
    tasks?: ReadonlyArray<{ name: string; trigger: 'cyclic' | 'freewheeling'; interval: number; priority: number; programs: string[] }>;
    memoryProfile?: CompilerMemoryProfile;
    strictTypes?: boolean;
    /** Where the first error is: the line and column (1-based) and the project file, when it has one. */
    line: number;
    column: number;
    file?: string;
    /** The message of the first error. */
    message: string;
}

export const ERROR_EXAMPLES: Partial<Record<ErrorCode, ErrorExample>> = {
    UNEXPECTED_CHARACTER: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 1 @ 2;\nEND_PROGRAM\n',
        line: 6,
        column: 10,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Unexpected character: '@'",
    },
    UNTERMINATED_COMMENT: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  (* never closed\n  X := 1;\nEND_PROGRAM\n',
        line: 6,
        column: 3,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Unterminated comment: the comment opened by (* is never closed with *)",
    },
    UNTERMINATED_STRING_LITERAL: {
        source: "PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  S : STRING;\nEND_VAR\n  S := 'open;\nEND_PROGRAM\n",
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Unterminated string literal (newline in string)",
    },
    INVALID_NUMBER_LITERAL: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 3#12;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: The number base 3# is not supported: use 2#, 8# or 16#",
    },
    INVALID_TYPED_LITERAL: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := INT#1.5;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: INT#1.5: an integer literal has no fraction or exponent",
    },
    UNEXPECTED_TOKEN: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := ;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Expected expression, got SEMICOLON",
    },
    UNSUPPORTED_CONSTRUCT: {
        source: 'NAMESPACE Plant\nEND_NAMESPACE\nPROGRAM Main\nEND_PROGRAM\n',
        line: 1,
        column: 1,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: NAMESPACE ... END_NAMESPACE is not supported",
    },
    INVALID_ARRAY_DECLARATION: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  A : ARRAY[5..1] OF INT;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 17,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Invalid array bounds: 5..1 (upper must be >= lower)",
    },
    CIRCULAR_TYPE_ALIAS: {
        source: 'TYPE A : B; B : A; END_TYPE\nPROGRAM Main\nEND_PROGRAM\n',
        line: 1,
        column: 1,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: The type alias 'A' refers to itself",
    },
    INVALID_STRING_CAPACITY: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  S : STRING[0];\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 14,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: The capacity of STRING must be an integer constant of 1 or more",
    },
    INVALID_TIME_LITERAL: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  T : TIME;\nEND_VAR\n  T := T#5x;\nEND_PROGRAM\n',
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Invalid time literal: 5x",
    },
    INVALID_DIRECT_ADDRESS: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Q AT %IW : INT;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 8,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Invalid I/O address: %IW",
    },
    INVALID_BIT_ACCESS: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  B := X.20;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: 'Bit 20 is out of range for INT: it has bits 0 to 15',
    },
    INVALID_ENUMERATION: {
        source: 'TYPE Color : (Red := X, Green); END_TYPE\nPROGRAM Main\nEND_PROGRAM\n',
        line: 1,
        column: 23,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Enum value must be an integer literal",
    },
    INVALID_FUNCTION_RETURN_TYPE: {
        source: 'FUNCTION F : ARRAY[0..3] OF INT\nEND_FUNCTION\nPROGRAM Main\nEND_PROGRAM\n',
        line: 2,
        column: 1,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: Function return type must be an elementary type, not ARRAY",
    },
    INVALID_OUTPUT_BINDING: {
        source:
            'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Tmr : TON;\nEND_VAR\n  X := 1;\n  Tmr(IN := B, PT := T#1s, Q => ' +
            '5);\nEND_PROGRAM\n',
        line: 8,
        column: 33,
        file: 'src/Main.st',
        message: "Compilation of 'Main' failed: An output binding names the variable that receives 'Q'",
    },
    UNKNOWN_IDENTIFIER: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := Missing;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Unknown identifier 'Missing'",
    },
    UNKNOWN_MEMBER: {
        source:
            'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Tmr : TON;\nEND_VAR\n  Tmr(IN := B, PT := T#1s);\n  B := ' +
            'Tmr.Nope;\nEND_PROGRAM\n',
        line: 8,
        column: 8,
        file: 'src/Main.st',
        message: "Unknown member 'Nope' on FB 'TON'",
    },
    UNKNOWN_TYPE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Y : Widget;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 7,
        file: 'src/Main.st',
        message: "Unknown type 'Widget' in the declaration of 'Y'",
    },
    UNKNOWN_FUNCTION: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := NoSuchFunction(1);\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Unknown function 'NoSuchFunction'",
    },
    UNKNOWN_METHOD: {
        source: 'FUNCTION_BLOCK Fb\nEND_FUNCTION_BLOCK\nPROGRAM Main\nVAR\n  I : Fb;\nEND_VAR\n  I.Missing();\nEND_PROGRAM\n',
        line: 7,
        column: 3,
        file: 'src/Main.st',
        message: "Unknown method 'Missing' on FB 'Fb'",
    },
    UNKNOWN_PARAMETER: {
        source:
            'FUNCTION Twice : INT\nVAR_INPUT\n  V : INT;\nEND_VAR\n  Twice := V * 2;\nEND_FUNCTION\nPROGRAM Main\nVAR\n  X : ' +
            'INT;\nEND_VAR\n  X := Twice(W := 1);\nEND_PROGRAM\n',
        line: 11,
        column: 14,
        file: 'src/Main.st',
        message: "Function 'Twice' has no input parameter 'W'",
    },
    MISSING_ARGUMENT: {
        source:
            'FUNCTION Twice : INT\nVAR_INPUT\n  V : INT;\nEND_VAR\n  Twice := V * 2;\nEND_FUNCTION\nPROGRAM Main\nVAR\n  X : ' +
            'INT;\nEND_VAR\n  X := Twice();\nEND_PROGRAM\n',
        line: 11,
        column: 8,
        file: 'src/Main.st',
        message: "Function 'Twice' is called without its parameter 'V'",
    },
    INVALID_ARGUMENTS: {
        source:
            'FUNCTION Twice : INT\nVAR_INPUT\n  V : INT;\nEND_VAR\n  Twice := V * 2;\nEND_FUNCTION\nPROGRAM Main\nVAR\n  X : ' +
            'INT;\nEND_VAR\n  X := Twice(V := 1, V := 2);\nEND_PROGRAM\n',
        line: 11,
        column: 22,
        file: 'src/Main.st',
        message: "Parameter 'V' of function 'Twice' is given twice",
    },
    RECURSIVE_CALL: {
        source:
            'FUNCTION F : INT\nVAR_INPUT\n  V : INT;\nEND_VAR\n  F := F(V := V);\nEND_FUNCTION\nPROGRAM Main\nVAR\n  X : ' +
            'INT;\nEND_VAR\n  X := F(V := 1);\nEND_PROGRAM\n',
        line: 5,
        column: 8,
        file: 'src/Main.st',
        message: "Function 'F' calls itself: a function cannot be recursive",
    },
    DUPLICATE_DECLARATION: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  X : INT;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 3,
        file: 'src/Main.st',
        message: "Symbol 'X' already defined",
    },
    TYPE_MISMATCH: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  B := X;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message:
            'Type mismatch: a value of type INT cannot be used where BOOL is expected. IEC 61131-3 converts implicitly only to a wider ' +
            'type of the same kind; convert it explicitly, for example with INT_TO_BOOL',
    },
    NARROWING_NOT_ALLOWED: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Y : SINT;\nEND_VAR\n  Y := X;\nEND_PROGRAM\n',
        strictTypes: true,
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message:
            'Implicit narrowing from INT to SINT: a value that does not fit keeps only its low 8 bits; use an explicit conversion if ' +
            'that is intended. This is an error because compiler.strictTypes is on',
    },
    CONSTANT_OUT_OF_RANGE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Y : SINT;\nEND_VAR\n  Y := 300;\nEND_PROGRAM\n',
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message: 'The constant 300 does not fit SINT (-128 to 127)',
    },
    STRING_TOO_LONG: {
        source: "PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  S : STRING[4];\nEND_VAR\n  S := 'much too long';\nEND_PROGRAM\n",
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message: "String literal of 13 characters does not fit 'S' (STRING[4] holds 4)",
    },
    ASSIGNMENT_TO_CONSTANT: {
        source: 'PROGRAM Main\nVAR CONSTANT\n  K : INT := 1;\nEND_VAR\n  K := 2;\nEND_PROGRAM\n',
        line: 5,
        column: 3,
        file: 'src/Main.st',
        message: "Cannot assign to constant 'K'",
    },
    INVALID_INITIALISER: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  A : ARRAY[0..1] OF INT := [1, 2, 3];\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 29,
        file: 'src/Main.st',
        message: "Too many initial values for 'A': 3 given, it has 2 elements",
    },
    INVALID_ARRAY_ACCESS: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := X[1];\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "'X' is not an array",
    },
    INDEX_OUT_OF_BOUNDS: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  A : ARRAY[0..3] OF INT;\nEND_VAR\n  X := A[9];\nEND_PROGRAM\n',
        line: 7,
        column: 10,
        file: 'src/Main.st',
        message: "Array index 9 is outside the bounds 0..3 of 'A'",
    },
    INVALID_MEMBER_ACCESS: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := X.field;\nEND_PROGRAM\n',
        line: 6,
        column: 8,
        file: 'src/Main.st',
        message: "Cannot access member 'field' of 'X': type 'INT' has no members",
    },
    INVALID_REFERENCE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  P : INT;\nEND_VAR\n  X := P^;\nEND_PROGRAM\n',
        line: 7,
        column: 8,
        file: 'src/Main.st',
        message: "'P' is not a reference: only a REF_TO variable can be dereferenced",
    },
    INVALID_CASE_LABEL: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  CASE X OF\n    X: B := TRUE;\n  END_CASE;\nEND_PROGRAM\n',
        line: 7,
        column: 5,
        file: 'src/Main.st',
        message: "'X' is not an integer constant",
    },
    OVERLAPPING_CASE_LABELS: {
        source:
            'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  CASE X OF\n    1..5: B := TRUE;\n    3: B := FALSE;\n ' +
            ' END_CASE;\nEND_PROGRAM\n',
        line: 8,
        column: 5,
        file: 'src/Main.st',
        message: 'CASE label 3 overlaps an earlier label',
    },
    INVALID_FOR_COUNTER: {
        source:
            'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  R : LREAL;\nEND_VAR\n  FOR R := 1 TO 3 DO\n    X := X + 1;\n ' +
            ' END_FOR;\nEND_PROGRAM\n',
        line: 7,
        column: 3,
        file: 'src/Main.st',
        message: 'A FOR counter must be an integer variable, not LREAL',
    },
    JUMP_OUTSIDE_LOOP: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  EXIT;\nEND_PROGRAM\n',
        line: 6,
        column: 3,
        file: 'src/Main.st',
        message: 'EXIT outside of loop',
    },
    UNSUPPORTED_ARGUMENT_TYPE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  WS : WSTRING;\n  S : STRING;\nEND_VAR\n  S := LEFT(WS, 2);\nEND_PROGRAM\n',
        line: 8,
        column: 13,
        file: 'src/Main.st',
        message: 'LEFT does not take a WSTRING yet: only LEN, assignment and initial values do',
    },
    INVALID_INHERITANCE: {
        source: 'FUNCTION_BLOCK Child EXTENDS Missing\nEND_FUNCTION_BLOCK\nPROGRAM Main\nEND_PROGRAM\n',
        line: 1,
        column: 1,
        file: 'src/Main.st',
        message: 'Circular inheritance or missing base FB in definitions: Child (extends Missing)',
    },
    ABSTRACT_INSTANTIATION: {
        source: 'FUNCTION_BLOCK ABSTRACT Base\nEND_FUNCTION_BLOCK\nPROGRAM Main\nVAR\n  B : Base;\nEND_VAR\nEND_PROGRAM\n',
        line: 5,
        column: 3,
        file: 'src/Main.st',
        message: "'B' is an instance of the ABSTRACT function block 'Base'",
    },
    INVALID_OVERRIDE: {
        source:
            'FUNCTION_BLOCK Base\nEND_FUNCTION_BLOCK\nFUNCTION_BLOCK Child EXTENDS Base\n  METHOD OVERRIDE Run : BOOL\n ' +
            ' END_METHOD\nEND_FUNCTION_BLOCK\nPROGRAM Main\nEND_PROGRAM\n',
        line: 4,
        column: 3,
        file: 'src/Main.st',
        message: "Method 'Run' marked as OVERRIDE but no base method found in 'Child'",
    },
    INTERFACE_NOT_IMPLEMENTED: {
        source:
            'INTERFACE IRun\n  METHOD Run : BOOL\n  END_METHOD\nEND_INTERFACE\nFUNCTION_BLOCK Fb IMPLEMENTS ' +
            'IRun\nEND_FUNCTION_BLOCK\nPROGRAM Main\nEND_PROGRAM\n',
        line: 5,
        column: 1,
        file: 'src/Main.st',
        message: "Function Block 'Fb' implements interface 'IRun' but is missing required method 'Run'",
    },
    ACCESS_VIOLATION: {
        source:
            'FUNCTION_BLOCK Fb\n  METHOD PRIVATE Hidden : BOOL\n    Hidden := TRUE;\n  END_METHOD\nEND_FUNCTION_BLOCK\nPROGRAM ' +
            'Main\nVAR\n  I : Fb;\n  B : BOOL;\nEND_VAR\n  B := I.Hidden();\nEND_PROGRAM\n',
        line: 11,
        column: 8,
        file: 'src/Main.st',
        message: "The method 'Hidden' of 'Fb' is PRIVATE: it can be called only inside 'Fb'",
    },
    INVALID_THIS_OR_SUPER: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  SUPER^();\nEND_PROGRAM\n',
        line: 6,
        column: 3,
        file: 'src/Main.st',
        message: 'SUPER^ is used outside of a function block',
    },
    INVALID_EXTERNAL_DECLARATION: {
        source: 'PROGRAM Main\nVAR_EXTERNAL\n  Nowhere : INT;\nEND_VAR\nEND_PROGRAM\n',
        line: 3,
        column: 3,
        file: 'src/Main.st',
        message: "VAR_EXTERNAL 'Nowhere' has no VAR_GLOBAL declaration",
    },
    WORK_MEMORY_EXCEEDED: {
        source: 'PROGRAM Main\nVAR\n  Table : ARRAY[0..8999] OF BYTE;\n  Gain : REAL;\nEND_VAR\n  Gain := 1.5;\nEND_PROGRAM\n',
        line: 3,
        column: 1,
        file: 'src/Main.st',
        message:
            'WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (the WORK memory of the target ' +
            'profile, one byte of it the initialization flag). Largest consumers: Main.Table (9000 bytes), Main.Gain (4 bytes)',
    },
    RETAIN_MEMORY_EXCEEDED: {
        source: 'PROGRAM Main\nVAR RETAIN\n  Log : ARRAY[0..5000] OF BYTE;\n  Count : DINT;\nEND_VAR\n  Count := Count + 1;\nEND_PROGRAM\n',
        line: 3,
        column: 1,
        file: 'src/Main.st',
        message:
            'RETAIN allocation exceeds the target memory profile: 5012 bytes required, 4096 bytes available (the retentive memory of the ' +
            'target profile). Largest consumers: Main.Log (5001 bytes), Main.Count (4 bytes)',
    },
    CODE_MEMORY_EXCEEDED: {
        source:
            'FUNCTION Twice : INT\nVAR_INPUT\n  V : INT;\nEND_VAR\n  Twice := V * 2;\nEND_FUNCTION\nPROGRAM Main\nVAR\n  X : INT;\n ' +
            ' B : BOOL;\nEND_VAR\n  X := Twice(V := X);\n  X := X + 1;\n  X := X * 2;\n  X := X - 3;\nEND_PROGRAM\n',
        memoryProfile: { workSize: 8192, retainSize: 4096, codeSizeMax: 40 },
        line: 7,
        column: 1,
        file: 'src/Main.st',
        message:
            'CODE exceeds the target memory profile: 81 bytes required, 40 bytes available (the code memory of the target profile). ' +
            'Largest consumers: Program Main (53 bytes), Function Twice (25 bytes)',
    },
    INVALID_MEMORY_PROFILE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        memoryProfile: { workSize: 0, retainSize: 4096, codeSizeMax: 4096 },
        line: 1,
        column: 1,
        file: 'zplc.json',
        message: 'Invalid target memory profile',
    },
    ADDRESS_OUT_OF_REGION: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Big AT %MB9000000 : BYTE;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 1,
        file: 'src/Main.st',
        message: 'WORK allocation exceeds its memory region',
    },
    ADDRESS_OVERLAP: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  A AT %MW0 : INT;\n  B2 AT %MB1 : BYTE;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 1,
        file: 'src/Main.st',
        message: 'automatic WORK symbol collides with located %M symbol',
    },
    INVALID_LOCATED_VARIABLE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  Q AT %QX0.1 : INT;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 1,
        file: 'src/Main.st',
        message: 'Bit-addressed locations require BOOL values',
    },
    INVALID_TAG: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\n  T : DINT {publish};\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        line: 5,
        column: 1,
        file: 'src/Main.st',
        message: "PUBLISH tag on 'T' does not support DINT",
    },
    STACK_DEPTH_EXCEEDED: {
        source:
            'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 13 + (12 + (11 + (10 + (9 + (8 + (7 + (6 + (5 + (4 + (3 + ' +
            '(2 + (1))))))))))));\nEND_PROGRAM\n',
        memoryProfile: { workSize: 8192, retainSize: 4096, codeSizeMax: 45056, stackMaxDepth: 8, callStackMax: 32 },
        line: 1,
        column: 1,
        file: 'src/Main.st',
        message:
            "Task 'Main' needs an evaluation stack of 13 values and the target holds 8: split the largest expression, or move part of " +
            'the program into a function',
    },
    NO_PROGRAM: {
        source: 'FUNCTION F : INT\nEND_FUNCTION\n',
        line: 1,
        column: 1,
        file: 'src/Main.st',
        message: 'No program found in source',
    },
    MULTIPLE_PROGRAMS_IN_SOURCE: {
        source: 'PROGRAM A\nEND_PROGRAM\nPROGRAM Main\nEND_PROGRAM\n',
        line: 3,
        column: 1,
        file: 'src/Main.st',
        message: 'Exactly one PROGRAM is required per source unit',
    },
    INVALID_TASK_CONFIGURATION: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        tasks: [{ name: 'Main', trigger: 'cyclic', interval: 0, priority: 1, programs: ['Main'] }],
        line: 1,
        column: 1,
        file: 'zplc.json',
        message: "Task 'Main' has invalid interval",
    },
    INVALID_SAFE_VALUE: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        safeOutputs: [
            { offset: 0, bit: 3, value: 1 },
            { offset: 0, bit: 3, value: 0 },
        ],
        line: 1,
        column: 1,
        file: 'zplc.json',
        message: 'Safe value 1 declares output byte 0 bit 3 twice',
    },
    UNKNOWN_TASK_PROGRAM: {
        source: 'PROGRAM Main\nVAR\n  X : INT;\n  B : BOOL;\nEND_VAR\n  X := 1;\nEND_PROGRAM\n',
        tasks: [{ name: 'Main', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Nope'] }],
        line: 1,
        column: 1,
        file: 'zplc.json',
        message: "Program 'Nope' referenced by task but not found in sources",
    },
    OUTPUT_OWNERSHIP_CONFLICT: {
        files: {
            Main: 'PROGRAM Main\nVAR\n  Out AT %QX0.0 : BOOL;\nEND_VAR\n  Out := TRUE;\nEND_PROGRAM\n',
            Other: 'PROGRAM Other\nVAR\n  Out AT %QX0.0 : BOOL;\nEND_VAR\n  Out := FALSE;\nEND_PROGRAM\n',
        },
        tasks: [
            { name: 'Main', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Main'] },
            { name: 'Other', trigger: 'cyclic', interval: 10, priority: 2, programs: ['Other'] },
        ],
        line: 3,
        column: 1,
        file: 'src/Other.st',
        message: "Physical output 'Other.Out' (src/Other.st) overlaps 'Main.Out' (src/Main.st)",
    },
};
