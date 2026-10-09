PROGRAM CtuEdgeOnResetRelease
VAR
  cuIn AT %IX0.0 : BOOL;
  rIn AT %IX0.1 : BOOL;
  c : CTU;
  q AT %QX0.0 : BOOL;
  cv AT %QW1 : INT;
END_VAR
  c(CU := cuIn, R := rIn, PV := 1);
  q := c.Q;
  cv := c.CV;
END_PROGRAM
