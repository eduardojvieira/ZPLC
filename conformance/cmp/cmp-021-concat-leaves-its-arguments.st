PROGRAM Main
VAR
  a : STRING[16] := 'ab';
  b : STRING[16] := 'cd';
  r : STRING[16];
  la AT %QW0 : INT;
  lb AT %QW1 : INT;
  lr AT %QW2 : INT;
  ok AT %QX6.0 : BOOL;
END_VAR
  r := CONCAT(a, b);
  la := LEN(a);
  lb := LEN(b);
  lr := LEN(r);
  ok := r = 'abcd';
END_PROGRAM
