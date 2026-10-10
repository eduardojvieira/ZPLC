PROGRAM Main
VAR
  r : ARRAY[0..2] OF REAL;
  f : ARRAY[0..2] OF BOOL;
  sum AT %QD0 : REAL;
  second AT %QX4.0 : BOOL;
  third AT %QX4.1 : BOOL;
END_VAR
  r[0] := 1.5;
  r[1] := 2.25;
  r[2] := 0.25;
  f[1] := TRUE;
  sum := r[0] + r[1] + r[2];
  second := f[1];
  third := f[2];
END_PROGRAM
