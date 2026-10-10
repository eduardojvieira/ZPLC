PROGRAM DoubleSpecials
VAR
  max : LREAL := 1.7976931348623157E308;
  one : LREAL := 1.0;
  zero : LREAL := 0.0;
  inf : LREAL;
  nan : LREAL;
  i1 AT %QD0 : LREAL;
  i2 AT %QD2 : LREAL;
  i3 AT %QD4 : LREAL;
  i4 AT %QD6 : LREAL;
  i5 AT %QD8 : LREAL;
  n1 AT %QD10 : LREAL;
  n2 AT %QD12 : LREAL;
  n3 AT %QD14 : LREAL;
  n4 AT %QD16 : LREAL;
  z1 AT %QD18 : LREAL;
END_VAR
  inf := max * 10.0;
  nan := inf - inf;
  i1 := inf;
  i2 := -inf;
  i3 := inf + one;
  i4 := one / inf;
  i5 := -one / inf;
  n1 := nan;
  n2 := nan + one;
  n3 := zero * inf;
  n4 := inf / inf;
  z1 := -zero;
END_PROGRAM
