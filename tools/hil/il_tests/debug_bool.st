PROGRAM DebugBool
VAR
  res_true AT %Q0.0 : BOOL;
  res_false AT %Q0.1 : BOOL;
END_VAR

VAR
    IL_CR : DINT;
    IL_CR_BOOL : BOOL;
    IL_CR_REAL : REAL;
END_VAR

(* Test Direct True Load *)
IL_CR_BOOL := TRUE;
res_true := IL_CR_BOOL;

(* Test Direct False Load *)
IL_CR_BOOL := FALSE;
res_false := IL_CR_BOOL;

END_PROGRAM
