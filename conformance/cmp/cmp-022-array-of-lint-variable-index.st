PROGRAM Main
VAR
  a : ARRAY[0..3] OF LINT;
  i : INT := 2;
  big : LINT := 5000000000;
  back : LINT;
  same AT %QX0.0 : BOOL;
  other AT %QX0.1 : BOOL;
  low AT %QD1 : DINT;
END_VAR
  a[i] := big;
  a[i + 1] := -9;
  back := a[i];
  same := back = 5000000000;
  other := a[3] = -9;
  low := a[2] - 5000000000;
END_PROGRAM
