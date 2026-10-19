PROGRAM AlarmLatch
VAR_INPUT Fault AT %I0.0 : BOOL; Ack AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT SetFirst AT %Q0.0 : BOOL; ResetFirst AT %Q0.1 : BOOL; END_VAR
VAR SetLatch : SR; ResetLatch : RS; END_VAR
SetLatch(S1 := Fault, R := Ack); SetFirst := SetLatch.Q1;
ResetLatch(S := Fault, R1 := Ack); ResetFirst := ResetLatch.Q1;
END_PROGRAM
