FUNCTION Peek : INT
VAR_INPUT n : INT; END_VAR
  Peek := n + hidden;
END_FUNCTION

PROGRAM Scopes
VAR
  hidden : INT := 5;
  out AT %QW0 : INT;
END_VAR
  out := Peek(1);
END_PROGRAM
