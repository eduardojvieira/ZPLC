FUNCTION_BLOCK Counter
VAR_INPUT inc : INT; END_VAR
VAR_OUTPUT total : INT; END_VAR
  total := total + inc;
END_FUNCTION_BLOCK

PROGRAM Composition
VAR
  a : Counter;
  b : Counter;
  x AT %QW0 : INT;
  y AT %QW1 : INT;
END_VAR
  a(inc := 1);
  b(inc := 10);
  x := a.total;
  y := b.total;
END_PROGRAM
