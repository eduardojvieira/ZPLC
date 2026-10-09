FUNCTION Succ : INT
VAR_INPUT a : INT; END_VAR
  Succ := a + 1;
END_FUNCTION

FUNCTION Twice : INT
VAR_INPUT a : INT; END_VAR
  Twice := a * 2;
END_FUNCTION

PROGRAM Scopes
VAR
  total AT %QW0 : INT;
END_VAR
  total := Succ(1) + Twice(2);
END_PROGRAM
