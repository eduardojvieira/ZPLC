PROGRAM Limits
VAR
  low : SINT := -128;
  high : SINT := 127;
  negative AT %QX0.0 : BOOL;
  ordered AT %QX0.1 : BOOL;
  span AT %QW2 : INT;
END_VAR
  negative := low < 0;
  ordered := high > low;
  span := high - low;
END_PROGRAM
