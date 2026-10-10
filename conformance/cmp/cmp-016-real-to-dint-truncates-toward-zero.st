PROGRAM Truncate
VAR
  up : REAL := 1.9;
  down : REAL;
  q_up AT %QD0 : DINT;
  q_down AT %QD4 : DINT;
END_VAR
  down := 0.0 - up;
  q_up := REAL_TO_DINT(TRUNC(up));
  q_down := REAL_TO_DINT(TRUNC(down));
END_PROGRAM
