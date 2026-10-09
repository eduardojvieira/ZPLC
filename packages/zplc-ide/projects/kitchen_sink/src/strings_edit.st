(*
 * Kitchen Sink 9/10 - string functions, part 3 (edit)
 *
 * Functions: INSERT, DELETE, REPLACE, CLEAR
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsStringsEdit
VAR
    Str1            : STRING := 'Hello';
    StrResult       : STRING;
END_VAR

StrResult := INSERT(Str1, '!!!', 5);
StrResult := DELETE(StrResult, 3, 5);
StrResult := REPLACE(Str1, 'Hi', 1, 2);
StrResult := CLEAR(StrResult);   (* CLEAR returns the cleared string *)

END_PROGRAM
