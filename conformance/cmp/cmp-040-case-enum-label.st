TYPE St : (IDLE, RUN); END_TYPE

PROGRAM Select
VAR
  state : St;
  picked AT %QW0 : INT;
END_VAR
  state := RUN;
  CASE state OF
    IDLE: picked := 1;
    RUN: picked := 2;
  END_CASE;
END_PROGRAM
