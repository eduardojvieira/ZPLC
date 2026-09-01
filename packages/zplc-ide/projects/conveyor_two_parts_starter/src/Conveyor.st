PROGRAM Conveyor
VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; Reset AT %I0.2 : BOOL; PartAtClassifier AT %I0.3 : BOOL; MetalDetected AT %I0.4 : BOOL; PartAtDiverter AT %I0.5 : BOOL; JamDetected AT %I0.6 : BOOL; END_VAR
VAR_OUTPUT BeltCommand AT %Q0.0 : BOOL; DiverterCommand AT %Q0.1 : BOOL; FaultLamp AT %Q0.2 : BOOL; END_VAR
(* Exercise: latch metal at the classifier and clear it at the diverter. *)
BeltCommand := Start; DiverterCommand := FALSE; FaultLamp := JamDetected;
END_PROGRAM
