(*
 * Kitchen Sink 10/10 - string functions, part 4 (copy and compare)
 *
 * Functions: COPY, STRCMP, EQ_STRING, NE_STRING
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsStringsCompare
VAR
    Str1            : STRING := 'Hello';
    Str2            : STRING := 'World';
    TempInt         : INT := 0;
    TempBool        : BOOL;
END_VAR

Str2 := COPY(Str1, Str2);        (* COPY(src, dst) returns dst *)
TempInt := STRCMP(Str1, Str2);
TempBool := EQ_STRING(Str1, 'Hello');
TempBool := NE_STRING(Str1, Str2);

END_PROGRAM
