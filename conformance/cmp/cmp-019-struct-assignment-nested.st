TYPE Inner : STRUCT a : DINT; b : INT; END_STRUCT END_TYPE
TYPE Outer : STRUCT n : INT; inner : Inner; tail : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  src : Outer;
  dst : Outer;
  oa AT %QD0 : DINT;
  ot AT %QD1 : DINT;
  on AT %QW4 : INT;
END_VAR
  src.n := 5;
  src.inner.a := 70000;
  src.tail := 80000;
  dst := src;
  src.inner.a := 1;
  src.tail := 2;
  oa := dst.inner.a;
  ot := dst.tail;
  on := dst.n;
END_PROGRAM
