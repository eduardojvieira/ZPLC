VAR_GLOBAL
  base : INT := 100;
END_VAR

FUNCTION Offset : INT
VAR_INPUT n : INT; END_VAR
VAR_EXTERNAL base : INT; END_VAR
  Offset := n + base;
END_FUNCTION

PROGRAM Scopes
VAR
  out AT %QW0 : INT;
  other AT %QW1 : INT;
END_VAR
  out := Offset(5);
  other := Offset(n := 6);
END_PROGRAM
