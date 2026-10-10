PROGRAM RealMath
VAR
  A : REAL := 6.0;
  Big AT %QX4.0 : BOOL;
  Quot AT %QD0 : REAL;
END_VAR
  LD A
  DIV 4.0
  MUL 3
  SUB 0.5
  ST Quot
  GT 3.5
  ST Big
END_PROGRAM
