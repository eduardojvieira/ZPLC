FUNCTION Grow : INT
VAR_INPUT n : INT; END_VAR
VAR
  s : STRING[16];
  a : ARRAY[0..2] OF INT;
END_VAR
  a[1] := a[1] + n;
  s := CONCAT(s, 'ab');
  Grow := LEN(s) * 10 + a[1];
END_FUNCTION

PROGRAM Main
VAR
  r AT %QW0 : INT;
END_VAR
  r := Grow(3);
END_PROGRAM
