PROGRAM Saturate
VAR
  high : REAL := 3.0E9;
  low : REAL;
  q_high AT %QD0 : DINT;
  q_low AT %QD4 : DINT;
END_VAR
  low := 0.0 - high;
  q_high := REAL_TO_INT(high);
  q_low := REAL_TO_INT(low);
END_PROGRAM
