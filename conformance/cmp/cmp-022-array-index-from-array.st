PROGRAM Main
VAR
  b : ARRAY[0..2] OF INT;
  a : ARRAY[0..4] OF DINT;
  v AT %QD0 : DINT;
END_VAR
  b[1] := 4;
  a[4] := 654321;
  v := a[b[1]];
END_PROGRAM
