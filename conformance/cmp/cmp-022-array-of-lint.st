PROGRAM Table
VAR
  a : ARRAY[0..3] OF LINT;
  ok AT %QX0.0 : BOOL;
END_VAR
  a[2] := 1;
  ok := a[2] = 1;
END_PROGRAM
