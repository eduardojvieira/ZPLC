TYPE Inner : STRUCT v : INT; END_STRUCT END_TYPE
TYPE Outer : STRUCT a : INT; inner : Inner; END_STRUCT END_TYPE

PROGRAM Nested
VAR
  o : Outer;
  seen AT %QW0 : INT;
END_VAR
  o.inner.v := 5;
  seen := o.inner.v;
END_PROGRAM
