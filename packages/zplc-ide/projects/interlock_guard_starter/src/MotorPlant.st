PROGRAM MotorPlant
VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; AtSpeed AT %I0.2 : BOOL; GuardClosed AT %I0.3 : BOOL; END_VAR
VAR_OUTPUT Command AT %Q0.0 : BOOL; Running AT %Q0.1 : BOOL; END_VAR
Command := (Start OR Command) AND NOT Stop;
Running := Command AND AtSpeed;
END_PROGRAM
