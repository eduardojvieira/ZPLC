PROGRAM Main
VAR
  long : STRING[16] := 'abcdefgh';
  short : STRING[5];
  l AT %QW0 : INT;
  ok AT %QX2.0 : BOOL;
END_VAR
  short := long;
  l := LEN(short);
  ok := short = 'abcde';
END_PROGRAM
