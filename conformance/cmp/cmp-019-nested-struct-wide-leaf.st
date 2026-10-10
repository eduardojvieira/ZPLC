TYPE Inner : STRUCT a : DINT; b : INT; END_STRUCT END_TYPE
TYPE Outer : STRUCT n : INT; inner : Inner; tail : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  o : Outer;
  oa AT %QD0 : DINT;
  ob AT %QW2 : INT;
  ot AT %QD2 : DINT;
  on AT %QW6 : INT;
END_VAR
  o.n := -2;
  o.inner.a := 70000;
  o.inner.b := -300;
  o.tail := 80000;
  oa := o.inner.a;
  ob := o.inner.b;
  ot := o.tail;
  on := o.n;
END_PROGRAM
