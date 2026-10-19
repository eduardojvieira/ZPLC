PROGRAM AlarmLatch
VAR_INPUT Fault AT %I0.0 : BOOL; Ack AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT SetFirst AT %Q0.0 : BOOL; ResetFirst AT %Q0.1 : BOOL; END_VAR
VAR SetLatch : SR; ResetLatch : RS; END_VAR
(* Exercise: both outputs latch a fault until Ack. SetFirst (SR) wins when Fault and Ack arrive together; ResetFirst (RS) loses to Ack. *)
SetFirst := Fault; ResetFirst := Fault;
END_PROGRAM
