(*
 * Kitchen Sink 8/10 - string functions, part 2 (join and cut)
 *
 * Functions: CONCAT, LEFT, RIGHT, MID
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsStringsBuild
VAR
    Str1            : STRING := 'Hello';
    StrResult       : STRING;
END_VAR

StrResult := CONCAT(Str1, ' ');
StrResult := CONCAT(StrResult, 'World');
StrResult := LEFT(Str1, 3);
StrResult := RIGHT(StrResult, 3);
StrResult := MID(Str1, 2, 3);

END_PROGRAM
