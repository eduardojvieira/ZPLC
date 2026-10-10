FUNCTION Twice : REAL
VAR_INPUT
  x : REAL;
END_VAR
  Twice := x * 2.0;
END_FUNCTION

PROGRAM Caller
VAR
  n : INT := -3;
  r AT %QD0 : REAL;
END_VAR
  r := Twice(n);
END_PROGRAM
