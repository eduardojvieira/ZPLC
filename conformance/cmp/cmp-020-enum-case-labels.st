TYPE St : (IDLE, RUN, FAULT := 5); END_TYPE

PROGRAM Main
VAR
  s : St;
  r AT %QW0 : INT;
END_VAR
  s := St#FAULT;
  CASE s OF
    IDLE: r := 10;
    RUN: r := 20;
    FAULT: r := 50;
  END_CASE;
END_PROGRAM
