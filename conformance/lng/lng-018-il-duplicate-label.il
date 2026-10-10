PROGRAM TwoLabels
VAR
  A : BOOL;
  X : BOOL;
END_VAR
again:
  LD A
  ST X
again:
  LD X
  ST A
END_PROGRAM
