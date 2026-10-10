PROGRAM Main
VAR
  names : ARRAY[0..2] OF STRING[10];
  i : INT := 1;
  src : STRING[10] := 'pressure';
  l AT %QW0 : INT;
  ok AT %QX2.0 : BOOL;
END_VAR
  names[i] := LEFT(src, 4);
  l := LEN(names[1]);
  ok := names[1] = 'pres';
END_PROGRAM
