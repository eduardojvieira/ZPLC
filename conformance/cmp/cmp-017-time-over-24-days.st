PROGRAM Long
VAR
  span : TIME := T#30d;
  longer AT %QX0.0 : BOOL;
END_VAR
  longer := span > T#1d;
END_PROGRAM
