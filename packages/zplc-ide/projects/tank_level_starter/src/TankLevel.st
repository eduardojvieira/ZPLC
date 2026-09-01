PROGRAM TankLevel
VAR_INPUT AutoEnable AT %I0.0 : BOOL; LevelLow AT %I0.1 : BOOL; LevelHigh AT %I0.2 : BOOL; PumpFault AT %I0.3 : BOOL; EStop AT %I0.4 : BOOL; Reset AT %I0.5 : BOOL; END_VAR
VAR_OUTPUT Pump AT %Q0.0 : BOOL; Alarm AT %Q0.1 : BOOL; END_VAR
(* Exercise: latch the fault and require a reset edge before restarting. *)
Pump := AutoEnable AND LevelLow;
Alarm := FALSE;
END_PROGRAM
