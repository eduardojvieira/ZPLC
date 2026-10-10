PROGRAM DoubleSum
VAR
  a : LREAL := 0.1;
  b : LREAL := 0.2;
  big : LREAL := 10000000000.0;
  huge : LREAL := 1.0E16;
  tiny : LREAL := 1.0E-300;
  s1 AT %QD0 : LREAL;
  s2 AT %QD2 : LREAL;
  s3 AT %QD4 : LREAL;
  s4 AT %QD6 : LREAL;
  s5 AT %QD8 : LREAL;
  s6 AT %QD10 : LREAL;
  s7 AT %QD12 : LREAL;
  s8 AT %QD14 : LREAL;
END_VAR
  s1 := a + b;
  s2 := b - a;
  s3 := big + 1.0;
  s4 := huge + 1.0;
  s5 := huge + 3.0;
  s6 := tiny + huge;
  s7 := a - a;
  s8 := -a - b;
END_PROGRAM
