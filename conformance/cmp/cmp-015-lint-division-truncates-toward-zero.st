PROGRAM Quotients
VAR
  p7 : LINT := 7;
  m7 : LINT := -7;
  p2 : LINT := 2;
  m2 : LINT := -2;
  p3 : LINT := 3;
  m3 : LINT := -3;
  big : LINT := 1000000000000;
  seven : LINT := 7;
  min : LINT := -9223372036854775808;
  m1 : LINT := -1;
  max : LINT := 9223372036854775807;
  q1 AT %QD0 : LINT;
  q2 AT %QD2 : LINT;
  q3 AT %QD4 : LINT;
  q4 AT %QD6 : LINT;
  q5 AT %QD8 : LINT;
  q6 AT %QD10 : LINT;
  q7 AT %QD12 : LINT;
  r1 AT %QD14 : LINT;
  r2 AT %QD16 : LINT;
  r3 AT %QD18 : LINT;
  r4 AT %QD20 : LINT;
  r5 AT %QD22 : LINT;
  r6 AT %QD24 : LINT;
END_VAR
  q1 := p7 / p2;
  q2 := m7 / p2;
  q3 := p7 / m2;
  q4 := m7 / m2;
  q5 := big / seven;
  q6 := min / m1;
  q7 := max / m1;
  r1 := p7 MOD p3;
  r2 := m7 MOD p3;
  r3 := p7 MOD m3;
  r4 := big MOD seven;
  r5 := min MOD m1;
  r6 := m7 MOD m3;
END_PROGRAM
