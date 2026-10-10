PROGRAM Limits
VAR
  low : INT := -32768;
  high : INT := 32767;
  negative AT %QX0.0 : BOOL;
  ordered AT %QX0.1 : BOOL;
  span AT %QD4 : DINT;
  floor AT %QD8 : DINT;
END_VAR
  negative := low < 0;
  ordered := high > low;
  span := high - low;
  floor := low;
END_PROGRAM
