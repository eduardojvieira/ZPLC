FUNCTION Succ : INT
VAR_INPUT a : INT; END_VAR
  Succ := a + 1;
END_FUNCTION

PROGRAM Scopes
VAR
  a : INT := 9;
  total AT %QW0 : INT;
END_VAR
  total := Succ(1) + a;
END_PROGRAM
