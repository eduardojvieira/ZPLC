PROGRAM Short
VAR
  span : TIME := T#2s;
  longer AT %QX0.0 : BOOL;
END_VAR
  longer := span > T#1s;
END_PROGRAM
