PROGRAM EdgeCounter
VAR_INPUT PulseInput AT %I0.0 : BOOL; Reset AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT CountReached AT %Q0.0 : BOOL; END_VAR
(* Exercise: add R_TRIG and CTU with PV 3. *)
CountReached := FALSE;
END_PROGRAM
