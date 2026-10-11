PROGRAM DebugBool
VAR
  res_true AT %QX0.0 : BOOL;
  res_false AT %QX0.1 : BOOL;
END_VAR

LD TRUE
ST res_true

LD FALSE
ST res_false
END_PROGRAM
