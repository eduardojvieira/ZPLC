PROGRAM Main
VAR
  a : ARRAY[0..3] OF LINT;
  b : LINT;
  same AT %QX0.0 : BOOL;
  negative AT %QX0.1 : BOOL;
  neighbour AT %QX0.2 : BOOL;
END_VAR
  a[1] := -5;
  a[2] := 7;
  b := a[1];
  same := a[1] = -5;
  negative := b < 0;
  neighbour := a[2] = 7;
END_PROGRAM
