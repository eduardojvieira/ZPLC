PROGRAM Large
VAR
  a : ARRAY[0..199] OF INT;
  last AT %QW0 : INT;
END_VAR
  a[199] := 7;
  last := a[199];
END_PROGRAM
