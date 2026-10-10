PROGRAM Ramp
VAR
  target AT %ID0 : REAL;
  limiter : RAMP_REAL;
  smooth AT %QD0 : REAL;
END_VAR
  limiter(IN := target, RATE := 2.0);
  smooth := limiter.OUT;
END_PROGRAM
