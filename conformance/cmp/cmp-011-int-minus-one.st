PROGRAM MinusOne
VAR
  v : INT := -1;
  negative AT %QX0.0 : BOOL;
  same AT %QX0.1 : BOOL;
  wide AT %QD4 : DINT;
END_VAR
  negative := v < 0;
  same := v = -1;
  wide := v;
END_PROGRAM
