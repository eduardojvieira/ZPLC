PROGRAM Around
VAR
  below : UDINT := 2147483647;
  above : UDINT := 2147483648;
  gt AT %QX0.0 : BOOL;
  lt AT %QX0.1 : BOOL;
  ge AT %QX0.2 : BOOL;
  le AT %QX0.3 : BOOL;
END_VAR
  gt := above > below;
  lt := below < above;
  ge := above >= 2147483648;
  le := above <= below;
END_PROGRAM
