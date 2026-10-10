PROGRAM Limits
VAR
  low : DINT := -2147483648;
  high : DINT := 2147483647;
  negative AT %QX0.0 : BOOL;
  ordered AT %QX0.1 : BOOL;
  next AT %QD4 : DINT;
END_VAR
  negative := low < 0;
  ordered := high > low;
  next := low + 1;
END_PROGRAM
