PROGRAM AbsNeg
VAR
  neg : LINT := -9000000000;
  min : LINT := -9223372036854775808;
  pos : LINT := 9000000000;
  a1 AT %QD0 : LINT;
  a2 AT %QD2 : LINT;
  a3 AT %QD4 : LINT;
  n1 AT %QD6 : LINT;
  n2 AT %QD8 : LINT;
  n3 AT %QD10 : LINT;
END_VAR
  a1 := ABS(neg);
  a2 := ABS(min);
  a3 := ABS(pos);
  n1 := -neg;
  n2 := -min;
  n3 := -pos;
END_PROGRAM
