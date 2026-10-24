(* Latch: Q keeps its value between calls. Set turns it ON, Reset turns it OFF, and Reset wins when both are TRUE. *)
FUNCTION_BLOCK Latch
VAR_INPUT Set : BOOL; Reset : BOOL; END_VAR
VAR_OUTPUT Q : BOOL; END_VAR
Q := (Set OR Q) AND NOT Reset;
END_FUNCTION_BLOCK
