PROGRAM WideBits
VAR
  w : LWORD := 16#0000000100000000;
  l : LINT;
  b32 AT %QX512.0 : BOOL;
  b31 AT %QX512.1 : BOOL;
  o_l AT %QD0 : LINT;
  o_w AT %QD2 : LWORD;
END_VAR
  b32 := w.32;
  b31 := w.31;
  l := 0;
  l.63 := TRUE;
  l.0 := TRUE;
  w.63 := TRUE;
  w.32 := FALSE;
  o_l := l;
  o_w := w;
END_PROGRAM
