PROGRAM DebugVar
VAR
  val AT %QW0 : INT;
  res_gt AT %QX2.0 : BOOL;
END_VAR

LD 50
ST val

LD val
GT 40
ST res_gt
END_PROGRAM
