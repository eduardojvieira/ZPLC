FUNCTION_BLOCK Inc
VAR_IN_OUT x : DINT; END_VAR
  x := x + 100000;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  f : Inc;
  g : Inc;
  a : DINT := 1;
  b : DINT := 2;
  oa AT %QD0 : DINT;
  ob AT %QD1 : DINT;
END_VAR
  f(x := a);
  g(x := b);
  f();
  oa := a;
  ob := b;
END_PROGRAM
