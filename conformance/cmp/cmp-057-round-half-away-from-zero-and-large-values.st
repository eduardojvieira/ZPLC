PROGRAM Round
VAR
  below_half : REAL := 0.49999997;
  two_half : REAL := 2.5;
  large : REAL := 3.0E9;
  r0 AT %QD0 : REAL;
  r1 AT %QD1 : REAL;
  r2 AT %QD2 : REAL;
  r3 AT %QD3 : REAL;
  r4 AT %QD4 : REAL;
END_VAR
  r0 := ROUND(below_half);
  r1 := ROUND(two_half);
  r2 := ROUND(0.0 - two_half);
  r3 := ROUND(large);
  r4 := ROUND(0.5);
END_PROGRAM
