TYPE Pair : STRUCT a : INT := 3; b : INT := 4; END_STRUCT END_TYPE

PROGRAM Mixed
VAR RETAIN
  p : Pair;
  s : STRING[10] := 'abc';
  n : INT := 2;
END_VAR
VAR
  sum AT %QW0 : INT;
  len AT %QW2 : INT;
END_VAR
  n := n + 1;
  sum := p.a + p.b + n;
  len := LEN(s);
END_PROGRAM
