PROGRAM Both
VAR
  a : BOOL := TRUE;
  b : BOOL := TRUE;
  both AT %QX0.0 : BOOL;
END_VAR
  both := a & b;
END_PROGRAM
