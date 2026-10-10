PROGRAM Product
VAR
  a : LINT := 3;
  b : LINT := 4;
  c : LINT := 4294967295;
  d : LINT := -3;
  e : LINT := 4294967296;
  f : LINT := 9223372036854775807;
  g : LINT := -9223372036854775808;
  h : LINT := -1;
  i : LINT := 123456789012;
  j : LINT := 987;
  p1 AT %QD0 : LINT;
  p2 AT %QD2 : LINT;
  p3 AT %QD4 : LINT;
  p4 AT %QD6 : LINT;
  p5 AT %QD8 : LINT;
  p6 AT %QD10 : LINT;
  p7 AT %QD12 : LINT;
  p8 AT %QD14 : LINT;
END_VAR
  p1 := a * b;
  p2 := c * c;
  p3 := d * b;
  p4 := e * e;
  p5 := f * 2;
  p6 := g * h;
  p7 := i * j;
  p8 := -e * e;
END_PROGRAM
