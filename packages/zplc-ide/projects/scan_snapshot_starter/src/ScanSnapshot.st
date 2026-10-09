PROGRAM ScanSnapshot
VAR_INPUT Button AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Current AT %Q0.0 : BOOL; Delayed AT %Q0.1 : BOOL; RisingPulse AT %Q0.2 : BOOL; END_VAR
(* Exercise: keep Previous (the Button of the last scan), derive Delayed and RisingPulse from it, and update Previous at the end of the scan. *)
Current := Button; Delayed := FALSE; RisingPulse := FALSE;
END_PROGRAM
