TYPE Label : STRUCT id : INT; text : STRING[12]; END_STRUCT END_TYPE

PROGRAM Main
VAR
  l : Label;
  a : ARRAY[0..1] OF STRING[8];
  lt AT %QW0 : INT;
  la AT %QW1 : INT;
  id AT %QW2 : INT;
  ok AT %QX6.0 : BOOL;
END_VAR
  l.id := 42;
  l.text := 'motor 1';
  a[1] := 'pump';
  lt := LEN(l.text);
  la := LEN(a[1]);
  id := l.id;
  ok := a[1] = 'pump';
END_PROGRAM
