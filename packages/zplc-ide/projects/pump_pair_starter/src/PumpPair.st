FUNCTION_BLOCK Latch
VAR_INPUT Set : BOOL; Reset : BOOL; END_VAR
VAR_OUTPUT Q : BOOL; END_VAR
(* Exercise: Q keeps its value between scans. Set turns it ON, Reset turns it OFF, and Reset wins when both are TRUE. *)
END_FUNCTION_BLOCK

PROGRAM PumpPair
VAR_INPUT StartA AT %I0.0 : BOOL; StopA AT %I0.1 : BOOL; StartB AT %I0.2 : BOOL; StopB AT %I0.3 : BOOL; END_VAR
VAR_OUTPUT RunA AT %Q0.0 : BOOL; RunB AT %Q0.1 : BOOL; END_VAR
VAR PumpA : Latch; PumpB : Latch; END_VAR
PumpA(Set := StartA, Reset := StopA);
PumpB(Set := StartB, Reset := StopB);
RunA := PumpA.Q; RunB := PumpB.Q;
END_PROGRAM
