VAR_GLOBAL CONSTANT
  PI_REAL : REAL := 3.14159;
  PI_LREAL : LREAL := 3.14159;
  SIZE : DINT := 7;
END_VAR

PROGRAM DoubleContext
VAR
  x : LREAL := 0.0;
  half : LREAL := 0.5;
  c1 AT %QD0 : LREAL;
  c2 AT %QD2 : LREAL;
  c3 AT %QD4 : LREAL;
  c4 AT %QD6 : LREAL;
  c5 AT %QD8 : LREAL;
  c6 AT %QD10 : LREAL;
  c7 AT %QD12 : LREAL;
  k1 AT %QD14 : LREAL;
  k2 AT %QD16 : LREAL;
  k3 AT %QD18 : LREAL;
END_VAR
  c1 := 0.1 + 0.2;
  c2 := x + 0.1;
  c3 := half * 0.1;
  c4 := REAL#0.1 + x;
  c5 := LREAL#0.1 * 3;
  c6 := 1.0 / 3.0;
  c7 := -0.5 * 4;
  k1 := PI_REAL * 2.0;
  k2 := PI_LREAL * 2.0;
  k3 := SIZE / 2 + 0.5;
END_PROGRAM
