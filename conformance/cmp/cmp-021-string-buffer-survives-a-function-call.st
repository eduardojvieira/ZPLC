FUNCTION Mark : INT
VAR_INPUT k : INT; END_VAR
  Mark := LEN(CONCAT('abc', 'defg')) + k;
END_FUNCTION

FUNCTION Pair : INT
VAR_INPUT
  x : STRING[8];
  m : INT;
END_VAR
  Pair := LEN(x) * 100 + m;
END_FUNCTION

PROGRAM Main
VAR
  a : STRING[8] := 'hello';
  r AT %QW0 : INT;
END_VAR
  r := Pair(LEFT(a, 2), Mark(1));
END_PROGRAM
