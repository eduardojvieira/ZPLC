PROGRAM Main
VAR
  k : STRING[8] := 'abcdef';
  t : STRING[8] := 'wxyz';
  okK AT %QX0.0 : BOOL;
  okT AT %QX0.1 : BOOL;
END_VAR
  k := LEFT(k, LEN(k) - 2);
  t := LEFT(t, LEN(k) - 1);
  okK := k = 'abcd';
  okT := t = 'wxy';
END_PROGRAM
