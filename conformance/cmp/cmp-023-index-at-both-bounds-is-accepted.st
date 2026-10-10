PROGRAM Main
VAR
  a : ARRAY[2..4] OF INT;
  i : INT;
  first AT %QW0 : INT;
  last AT %QW1 : INT;
END_VAR
  i := 2;
  a[i] := 12;
  i := 4;
  a[i] := 14;
  i := 2;
  first := a[i];
  i := 4;
  last := a[i];
END_PROGRAM
