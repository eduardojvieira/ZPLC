(* ValveCtl: the command of one valve, written once and used for every valve of the machine.
   Open opens the valve and it stays open after Open is released; Close closes it; Permit must be TRUE
   for the valve to be open at all, so losing it closes the valve and keeps it closed. *)
FUNCTION_BLOCK ValveCtl
VAR_INPUT Open : BOOL; Close : BOOL; Permit : BOOL; END_VAR
VAR_OUTPUT Cmd : BOOL; END_VAR
Cmd := (Open OR Cmd) AND NOT Close AND Permit;
END_FUNCTION_BLOCK
