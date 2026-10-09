PROGRAM Scale
VAR
  count : INT := 3;
  gain : REAL := 2.0;
  scaled AT %QD0 : REAL;
END_VAR
  scaled := count * gain;
END_PROGRAM
