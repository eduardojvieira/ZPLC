FUNCTION_BLOCK Total
VAR_INPUT inc : INT; END_VAR
VAR_OUTPUT sum : INT; END_VAR
  sum := sum + inc;
END_FUNCTION_BLOCK

PROGRAM Composition
VAR
  t : ARRAY[0..1] OF Total;
  x AT %QW0 : INT;
  y AT %QW2 : INT;
END_VAR
  t[0](inc := 1);
  t[1](inc := 10);
  x := t[0].sum;
  y := t[1].sum;
END_PROGRAM
