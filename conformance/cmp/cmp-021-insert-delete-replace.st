PROGRAM Main
VAR
  s : STRING[16] := 'HELLO';
  i : STRING[16];
  d : STRING[16];
  r : STRING[16];
  ls AT %QW0 : INT;
  oki AT %QX2.0 : BOOL;
  okd AT %QX2.1 : BOOL;
  okr AT %QX2.2 : BOOL;
END_VAR
  i := INSERT(s, 'XY', 2);
  d := DELETE(s, 2, 2);
  r := REPLACE(s, 'AB', 2, 3);
  ls := LEN(s);
  oki := i = 'HEXYLLO';
  okd := d = 'HLO';
  okr := r = 'HABO';
END_PROGRAM
