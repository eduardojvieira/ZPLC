PROGRAM Main
VAR
  s : STRING[16] := 'HELLO';
  l : STRING[16];
  r : STRING[16];
  m : STRING[16];
  ls AT %QW0 : INT;
  okl AT %QX2.0 : BOOL;
  okr AT %QX2.1 : BOOL;
  okm AT %QX2.2 : BOOL;
END_VAR
  l := LEFT(s, 2);
  r := RIGHT(s, 3);
  m := MID(s, 2, 3);
  ls := LEN(s);
  okl := l = 'HE';
  okr := r = 'LLO';
  okm := m = 'ELL';
END_PROGRAM
