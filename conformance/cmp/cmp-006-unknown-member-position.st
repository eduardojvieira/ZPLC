FUNCTION_BLOCK Counter
VAR_INPUT inc : INT; END_VAR
VAR_OUTPUT total : INT; END_VAR
  total := total + inc;
END_FUNCTION_BLOCK

PROGRAM Typo
VAR
  c : Counter;
END_VAR
  c(nope := 2);
END_PROGRAM
