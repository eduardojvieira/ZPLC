FUNCTION_BLOCK Start
VAR_OUTPUT v : INT := 5; END_VAR
  v := v + 1;
END_FUNCTION_BLOCK

PROGRAM Members
VAR
  f : Start;
  seen AT %QW0 : INT;
END_VAR
  f();
  seen := f.v;
END_PROGRAM
