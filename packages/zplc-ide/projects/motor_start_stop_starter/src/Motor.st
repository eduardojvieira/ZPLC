PROGRAM Motor
VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; EStop AT %I0.2 : BOOL; Overload AT %I0.3 : BOOL; END_VAR
VAR_OUTPUT Forward AT %Q0.0 : BOOL; Reverse AT %Q0.1 : BOOL; END_VAR
(* Exercise: add a seal-in that drops on stop, EStop, and overload. *)
Forward := Start;
Reverse := FALSE;
END_PROGRAM
