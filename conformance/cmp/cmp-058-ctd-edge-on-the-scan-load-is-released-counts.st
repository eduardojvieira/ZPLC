PROGRAM CtdEdgeOnLoadRelease
VAR
  cdIn AT %IX0.0 : BOOL;
  ldIn AT %IX0.1 : BOOL;
  c : CTD;
  q AT %QX0.0 : BOOL;
  cv AT %QW1 : INT;
END_VAR
  c(CD := cdIn, LD := ldIn, PV := 3);
  q := c.Q;
  cv := c.CV;
END_PROGRAM
