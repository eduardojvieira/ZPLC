PROGRAM Logarithms
VAR
  ln_ten AT %QX0.0 : BOOL;
  ln_one AT %QX0.1 : BOOL;
  log_thousand AT %QX0.2 : BOOL;
  exp_one AT %QX0.3 : BOOL;
  exp_zero AT %QX0.4 : BOOL;
  exp_neg AT %QX0.5 : BOOL;
  sqrt_sixteen AT %QX0.6 : BOOL;
  sqrt_two AT %QX0.7 : BOOL;
END_VAR
  ln_ten := ABS(LN(10.0) - 2.3025851) < 0.001;
  ln_one := ABS(LN(1.0)) < 0.001;
  log_thousand := ABS(LOG(1000.0) - 3.0) < 0.001;
  exp_one := ABS(EXP(1.0) - 2.7182818) < 0.001;
  exp_zero := ABS(EXP(0.0) - 1.0) < 0.001;
  exp_neg := ABS(EXP(-1.0) - 0.3678794) < 0.001;
  sqrt_sixteen := ABS(SQRT(16.0) - 4.0) < 0.001;
  sqrt_two := ABS(SQRT(2.0) - 1.4142136) < 0.001;
END_PROGRAM
