PROGRAM Main
VAR
  a : ARRAY[0..1, 0..2] OF INT;
  v AT %QW0 : INT;
END_VAR
  v := a[1, 3];
END_PROGRAM
