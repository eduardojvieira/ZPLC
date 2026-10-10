PROGRAM Main
VAR
  a : STRING[16];
  b : STRING[16];
  la AT %QW0 : INT;
  lb AT %QW1 : INT;
  same AT %QX4.0 : BOOL;
END_VAR
  a := 'hello';
  b := a;
  a := 'x';
  la := LEN(a);
  lb := LEN(b);
  same := b = 'hello';
END_PROGRAM
