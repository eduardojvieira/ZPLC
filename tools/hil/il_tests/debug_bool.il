PROGRAM DebugBool
VAR
  res_true AT %Q0.0 : BOOL;
  res_false AT %Q0.1 : BOOL;
END_VAR

LD TRUE
ST res_true

LD FALSE
ST res_false
END_PROGRAM
