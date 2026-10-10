PROGRAM Smoothing
VAR
  raw AT %ID0 : REAL;
  lag : LAG_FILTER;
  smooth AT %QD0 : REAL;
END_VAR
  lag(IN := raw, GAIN := 0.5);
  smooth := lag.OUT;
END_PROGRAM
