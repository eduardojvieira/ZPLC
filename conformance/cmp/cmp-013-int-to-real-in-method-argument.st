FUNCTION_BLOCK Scaler
METHOD PUBLIC Twice : REAL
VAR_INPUT
  x : REAL;
END_VAR
  Twice := x * 2.0;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Caller
VAR
  s : Scaler;
  n : INT := -3;
  r AT %QD0 : REAL;
END_VAR
  r := s.Twice(n);
END_PROGRAM
