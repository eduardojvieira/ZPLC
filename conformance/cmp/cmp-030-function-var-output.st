FUNCTION Twice : INT
VAR_INPUT a : INT; END_VAR
VAR_OUTPUT o : INT; END_VAR
  o := a;
  Twice := a + a;
END_FUNCTION

PROGRAM Outputs
VAR
  seen AT %QW0 : INT;
END_VAR
  seen := Twice(3);
END_PROGRAM
