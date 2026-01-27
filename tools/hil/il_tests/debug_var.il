PROGRAM DebugVar
VAR
  val AT %Q0.0 : INT;
  res_gt AT %Q2.0 : BOOL;
END_VAR

LD 50
ST val

LD val
GT 40
ST res_gt
END_PROGRAM
