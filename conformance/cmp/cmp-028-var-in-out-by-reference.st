FUNCTION_BLOCK Inc
VAR_IN_OUT x : INT; END_VAR
  x := x + 1;
END_FUNCTION_BLOCK

PROGRAM Reference
VAR
  f : Inc;
  v : INT := 5;
  seen AT %QW0 : INT;
END_VAR
  f(x := v);
  seen := v;
END_PROGRAM
