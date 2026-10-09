PROGRAM Bits
VAR
  w : WORD := 1;
  low AT %QX0.0 : BOOL;
END_VAR
  low := w.0;
END_PROGRAM
