PROGRAM DoubleRounding
VAR
  a : LREAL := 2.7;
  b : LREAL := -2.7;
  h : LREAL := 2.5;
  nh : LREAL := -2.5;
  almost : LREAL := 0.49999999999999994;
  edge : LREAL := 4503599627370495.5;
  huge : LREAL := 1.0E300;
  small : LREAL := 0.3;
  t1 AT %QD0 : LREAL;
  t2 AT %QD2 : LREAL;
  t3 AT %QD4 : LREAL;
  t4 AT %QD6 : LREAL;
  r1 AT %QD8 : LREAL;
  r2 AT %QD10 : LREAL;
  r3 AT %QD12 : LREAL;
  r4 AT %QD14 : LREAL;
  r5 AT %QD16 : LREAL;
  r6 AT %QD18 : LREAL;
END_VAR
  t1 := TRUNC(a);
  t2 := TRUNC(b);
  t3 := TRUNC(huge);
  t4 := TRUNC(small);
  r1 := ROUND(h);
  r2 := ROUND(nh);
  r3 := ROUND(almost);
  r4 := ROUND(edge);
  r5 := ROUND(a);
  r6 := ROUND(huge);
END_PROGRAM
