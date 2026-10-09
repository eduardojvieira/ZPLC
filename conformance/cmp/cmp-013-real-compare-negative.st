PROGRAM Order
VAR
  low : REAL;
  high : REAL;
  ordered AT %QX0.0 : BOOL;
END_VAR
  low := 0.0 - 2.0;
  high := 0.0 - 1.0;
  ordered := low < high;
END_PROGRAM
