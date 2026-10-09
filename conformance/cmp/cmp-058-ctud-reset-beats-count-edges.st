PROGRAM CtudResetBeatsEdges
VAR
  cuIn AT %IX0.0 : BOOL;
  cdIn AT %IX0.1 : BOOL;
  rIn AT %IX0.2 : BOOL;
  ldIn AT %IX0.3 : BOOL;
  c : CTUD;
  qu AT %QX0.0 : BOOL;
  qd AT %QX0.1 : BOOL;
  cv AT %QW1 : INT;
END_VAR
  c(CU := cuIn, CD := cdIn, R := rIn, LD := ldIn, PV := 3);
  qu := c.QU;
  qd := c.QD;
  cv := c.CV;
END_PROGRAM
