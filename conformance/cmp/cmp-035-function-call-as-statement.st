FUNCTION Succ : INT
VAR_INPUT a : INT; END_VAR
  Succ := a + 1;
END_FUNCTION

PROGRAM Statement
VAR
  seen AT %QW0 : INT;
END_VAR
  Succ(1);
  seen := 5;
END_PROGRAM
