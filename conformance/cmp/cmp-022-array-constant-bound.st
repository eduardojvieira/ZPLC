VAR_GLOBAL CONSTANT N : INT := 4; END_VAR

PROGRAM Table
VAR
  a : ARRAY[0..N] OF INT;
  last AT %QW0 : INT;
END_VAR
  a[4] := 9;
  last := a[4];
END_PROGRAM
