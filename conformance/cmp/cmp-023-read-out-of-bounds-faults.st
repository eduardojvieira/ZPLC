PROGRAM Main
VAR
  a : ARRAY[0..3] OF DINT;
  i : INT := 4;
  v AT %QD0 : DINT;
END_VAR
  v := a[i];
END_PROGRAM
