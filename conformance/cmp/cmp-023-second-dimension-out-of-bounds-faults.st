PROGRAM Main
VAR
  a : ARRAY[0..1, 0..2] OF INT;
  j : INT := 3;
  v AT %QW0 : INT;
END_VAR
  v := a[1, j];
END_PROGRAM
