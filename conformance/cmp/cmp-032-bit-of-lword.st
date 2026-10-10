PROGRAM Bits
VAR
  l : LWORD;
  low AT %QX0.0 : BOOL;
  high AT %QX0.1 : BOOL;
  other AT %QX0.2 : BOOL;
END_VAR
  l.40 := TRUE;
  low := l.0;
  high := l.40;
  other := l.39;
END_PROGRAM
