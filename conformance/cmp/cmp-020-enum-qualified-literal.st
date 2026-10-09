TYPE St : (IDLE, RUN); END_TYPE

PROGRAM Machine
VAR
  state : St;
  running AT %QX0.0 : BOOL;
END_VAR
  state := St#RUN;
  running := state = RUN;
END_PROGRAM
