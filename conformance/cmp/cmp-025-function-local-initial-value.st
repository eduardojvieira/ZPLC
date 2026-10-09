FUNCTION Offset : INT
VAR_INPUT a : INT; END_VAR
VAR k : INT := 100; END_VAR
  Offset := a + k;
END_FUNCTION

PROGRAM Locals
VAR
  seen AT %QW0 : INT;
END_VAR
  seen := Offset(1);
END_PROGRAM
