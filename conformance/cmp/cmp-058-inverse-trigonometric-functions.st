PROGRAM InverseTrigonometry
VAR
  asin_half AT %QX0.0 : BOOL;
  asin_neg AT %QX0.1 : BOOL;
  acos_half AT %QX0.2 : BOOL;
  acos_one AT %QX0.3 : BOOL;
  atan_one AT %QX0.4 : BOOL;
  atan_neg AT %QX0.5 : BOOL;
END_VAR
  asin_half := ABS(ASIN(0.5) - 0.5235988) < 0.001;
  asin_neg := ABS(ASIN(-0.5) + 0.5235988) < 0.001;
  acos_half := ABS(ACOS(0.5) - 1.0471976) < 0.001;
  acos_one := ABS(ACOS(1.0)) < 0.001;
  atan_one := ABS(ATAN(1.0) - 0.7853982) < 0.001;
  atan_neg := ABS(ATAN(-1.0) + 0.7853982) < 0.001;
END_PROGRAM
