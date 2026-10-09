(*
 * Kitchen Sink 7/10 - string functions, part 1 (measure)
 *
 * A STRING takes 85 bytes of the program's 256-byte WORK region and string
 * literals live there too, so the string functions are spread over four
 * programs with at most two STRING variables each.
 *
 * Functions: LEN, FIND
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsStringsMeasure
VAR
    Str1            : STRING := 'Hello';
    StrLen          : INT := 0;
    StrPos          : INT := 0;
END_VAR

StrLen := LEN(Str1);
StrPos := FIND(Str1, 'ell');

END_PROGRAM
