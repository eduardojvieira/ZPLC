PROGRAM CtudThroughZero
VAR
  cuIn AT %IX0.0 : BOOL;
  cdIn AT %IX0.1 : BOOL;
  c : CTUD;
  qu AT %QX0.0 : BOOL;
  qd AT %QX0.1 : BOOL;
  cv AT %QW1 : INT;
END_VAR
  c(CU := cuIn, CD := cdIn, R := FALSE, LD := FALSE, PV := -1);
  qu := c.QU;
  qd := c.QD;
  cv := c.CV;
END_PROGRAM
