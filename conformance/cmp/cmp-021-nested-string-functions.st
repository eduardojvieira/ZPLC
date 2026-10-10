PROGRAM Main
VAR
  a : STRING[16] := 'one';
  b : STRING[16] := 'two';
  r : STRING[16];
  l AT %QW0 : INT;
  ok AT %QX2.0 : BOOL;
  eq AT %QX2.1 : BOOL;
END_VAR
  r := CONCAT(LEFT(a, 2), RIGHT(b, 2));
  l := LEN(r);
  ok := r = 'onwo';
  eq := LEFT(a, 1) = LEFT('ozone', 1);
END_PROGRAM
