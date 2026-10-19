PROGRAM Gate
VAR_INPUT Request AT %I0.0 : BOOL; Close AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT Open AT %Q0.0 : BOOL; END_VAR
(* The gate must hold itself open after Request is released. Close must always close it. *)
Open := Request AND NOT Close;
END_PROGRAM
