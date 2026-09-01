PROGRAM MotorPlant
VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; AtSpeed AT %I0.2 : BOOL; END_VAR
VAR_OUTPUT Command AT %Q0.0 : BOOL; Running AT %Q0.1 : BOOL; END_VAR
(* Exercise: retain request between start and stop. *)
Command := Start; Running := Start AND AtSpeed;
END_PROGRAM
