FUNCTION_BLOCK Counter
VAR_OUTPUT total : INT; END_VAR
  total := total + 1;
END_FUNCTION_BLOCK

FUNCTION_BLOCK DoubleCounter EXTENDS Counter
  SUPER^();
  total := total + 10;
END_FUNCTION_BLOCK

PROGRAM Run
VAR
  c : DoubleCounter;
  seen AT %QW0 : INT;
END_VAR
  c();
  c();
  seen := c.total;
END_PROGRAM
