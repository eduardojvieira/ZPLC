PROGRAM DoubleLibrary
VAR
  x : LREAL := 0.5;
  ten : LREAL := 10.0;
  e1 : LREAL := 1.0;
  tol : LREAL := 0.00001;
  sin_ok AT %QX512.0 : BOOL;
  cos_ok AT %QX512.1 : BOOL;
  exp_ok AT %QX512.2 : BOOL;
  ln_ok AT %QX512.3 : BOOL;
  atan_ok AT %QX512.4 : BOOL;
  sqrt_ok AT %QX512.5 : BOOL;
END_VAR
  sin_ok := ABS(SIN(x) - 0.479425538604203) < tol;
  cos_ok := ABS(COS(x) - 0.8775825618903728) < tol;
  exp_ok := ABS(EXP(e1) - 2.718281828459045) < tol;
  ln_ok := ABS(LN(ten) - 2.302585092994046) < tol;
  atan_ok := ABS(ATAN(x) - 0.4636476090008061) < tol;
  sqrt_ok := SQRT(ten) = 3.1622776601683795;
END_PROGRAM
