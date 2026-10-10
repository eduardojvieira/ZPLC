FUNCTION_BLOCK Scale
VAR_INPUT a : INT; END_VAR
VAR_OUTPUT b : INT; END_VAR
  b := a * factor;
END_FUNCTION_BLOCK

PROGRAM Caller
VAR
  s : Scale;
  seen AT %QW0 : INT;
END_VAR
  s(a := 2);
  seen := s.b;
END_PROGRAM
