PROGRAM Main
VAR
  a : STRING := 'abc';
  b : STRING[10] := 'hi';
  c : STRING[16];
  la AT %QW0 : INT;
  lb AT %QW1 : INT;
  lc AT %QW2 : INT;
  ok AT %QX6.0 : BOOL;
END_VAR
  la := LEN(a);
  lb := LEN(b);
  lc := LEN(c);
  ok := b = 'hi';
END_PROGRAM
