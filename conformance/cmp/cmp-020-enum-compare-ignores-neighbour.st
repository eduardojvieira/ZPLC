TYPE St : (IDLE, RUN); END_TYPE

PROGRAM Machine
VAR
  state : St;
  next : INT;
  running AT %QX0.0 : BOOL;
END_VAR
  state := RUN;
  next := 7;
  running := state = RUN;
END_PROGRAM
