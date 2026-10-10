PROGRAM Trigonometry
VAR
  sin_pos AT %QX0.0 : BOOL;
  sin_neg AT %QX0.1 : BOOL;
  cos_pos AT %QX0.2 : BOOL;
  cos_neg AT %QX0.3 : BOOL;
  tan_pos AT %QX0.4 : BOOL;
  tan_neg AT %QX0.5 : BOOL;
  sin_zero AT %QX0.6 : BOOL;
  cos_zero AT %QX0.7 : BOOL;
END_VAR
  sin_pos := ABS(SIN(1.0) - 0.8414710) < 0.001;
  sin_neg := ABS(SIN(-1.0) + 0.8414710) < 0.001;
  cos_pos := ABS(COS(1.0) - 0.5403023) < 0.001;
  cos_neg := ABS(COS(-1.0) - 0.5403023) < 0.001;
  tan_pos := ABS(TAN(1.0) - 1.5574077) < 0.001;
  tan_neg := ABS(TAN(-1.0) + 1.5574077) < 0.001;
  sin_zero := ABS(SIN(0.0)) < 0.001;
  cos_zero := ABS(COS(0.0) - 1.0) < 0.001;
END_PROGRAM
