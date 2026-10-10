PROGRAM Main
VAR
  a : WSTRING[10] := "hi";
  b : WSTRING[10];
  la AT %QW0 : INT;
  lb AT %QW1 : INT;
END_VAR
  b := "world";
  la := LEN(a);
  lb := LEN(b);
  a := b;
  la := LEN(a) * 10 + la;
END_PROGRAM
