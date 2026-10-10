PROGRAM Truncate
VAR
  negative : REAL := -3.7;
  fraction : REAL := 0.9;
  large : REAL := 3.0E9;
  t0 AT %QD0 : REAL;
  t1 AT %QD1 : REAL;
  t2 AT %QD2 : REAL;
  t3 AT %QD3 : REAL;
END_VAR
  t0 := TRUNC(negative);
  t1 := TRUNC(fraction);
  t2 := TRUNC(large);
  t3 := TRUNC(0.0 - fraction);
END_PROGRAM
