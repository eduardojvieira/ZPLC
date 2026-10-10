PROGRAM DoubleFunctions
VAR
  a : LREAL := -2.0;
  two : LREAL := 2.0;
  neg : LREAL := -4.0;
  tiny : LREAL := 1.0E-310;
  lo : LREAL := -1.5;
  hi : LREAL := 1.5;
  x : LREAL := 7.25;
  la : LINT := -5000000000;
  lb : LINT := 6000000000;
  sel : BOOL := TRUE;
  k : DINT := 2;
  f1 AT %QD0 : LREAL;
  f2 AT %QD2 : LREAL;
  f3 AT %QD4 : LREAL;
  f4 AT %QD6 : LREAL;
  f5 AT %QD8 : LREAL;
  f6 AT %QD10 : LREAL;
  f7 AT %QD12 : LREAL;
  f8 AT %QD14 : LREAL;
  f9 AT %QD16 : LREAL;
  f10 AT %QD18 : LREAL;
  f11 AT %QD20 : LREAL;
  g1 AT %QD22 : LINT;
  g2 AT %QD24 : LINT;
  g3 AT %QD26 : LINT;
  g4 AT %QD28 : LINT;
  g5 AT %QD30 : LINT;
  g6 AT %QD32 : LINT;
END_VAR
  f1 := ABS(a);
  f2 := SQRT(two);
  f3 := SQRT(neg);
  f4 := SQRT(tiny);
  f5 := MAX(a, two);
  f6 := MIN(a, two);
  f7 := LIMIT(lo, x, hi);
  f8 := LIMIT(lo, -9.0, hi);
  f9 := LIMIT(lo, 0.25, hi);
  f10 := SEL(sel, a, two);
  f11 := MUX(k, a, two, x);
  g1 := MAX(la, lb);
  g2 := MIN(la, lb);
  g3 := LIMIT(-1000000000000, la, 1000000000000);
  g4 := LIMIT(0, la, lb);
  g5 := SEL(sel, la, lb);
  g6 := MUX(0, la, lb);
END_PROGRAM
