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
END_VAR
  c1 := 0.1 + 0.2;
  c2 := x + 0.1;
  c3 := half * 0.1;
  c4 := REAL#0.1 + x;
  c5 := LREAL#0.1 * 3;
  c6 := 1.0 / 3.0;
  c7 := -0.5 * 4;
END_PROGRAM
