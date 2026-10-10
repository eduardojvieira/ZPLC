VAR_GLOBAL CONSTANT N : INT := 2; END_VAR

PROGRAM Main
VAR
  a : ARRAY[N - 2 .. N * 2 - 1] OF INT;
  last AT %QW0 : INT;
END_VAR
  a[3] := 33;
  last := a[3];
END_PROGRAM
