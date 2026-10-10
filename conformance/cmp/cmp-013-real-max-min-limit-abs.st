PROGRAM Functions
VAR
  a : REAL := -2.5;
  b : REAL := -1.5;
  hi AT %QD0 : REAL;
  lo AT %QD4 : REAL;
  clamped AT %QD8 : REAL;
  magnitude AT %QD12 : REAL;
END_VAR
  hi := MAX(a, b);
  lo := MIN(a, b);
  clamped := LIMIT(-1.0, a, 1.0);
  magnitude := ABS(a);
END_PROGRAM
