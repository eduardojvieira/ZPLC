PROGRAM LubePulse
VAR_INPUT Press AT %I0.0 : BOOL; GuardClosed AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT Pump AT %QX0.0 : BOOL; END_VAR
(* Exercise: each press with the guard closed switches the pump ON for 500 ms, however long the button stays pressed. A press while the guard is open does nothing, not even later, and a pulse that has started always runs to its end. *)
Pump := Press;
END_PROGRAM
