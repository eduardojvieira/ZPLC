TYPE St : (IDLE, RUN, FAULT); END_TYPE

PROGRAM Main
VAR
  s : St := St#RUN;
  r AT %QW0 : INT;
END_VAR
  CASE s OF
    St#IDLE: r := 10;
    St#RUN: r := 20;
    St#FAULT: r := 30;
  END_CASE;
END_PROGRAM
