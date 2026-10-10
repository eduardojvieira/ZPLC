PROGRAM Main
VAR
  s : STRING[16] := 'abc';
  l : STRING[16];
  r : STRING[16];
  ll AT %QW0 : INT;
  lr AT %QW1 : INT;
  z AT %QW2 : INT;
END_VAR
  l := LEFT(s, 10);
  r := RIGHT(s, 10);
  ll := LEN(l);
  lr := LEN(r);
  z := LEN(LEFT(s, 0));
END_PROGRAM
