PROGRAM Quiet
VAR
  raw AT %ID0 : REAL;
  filter : DEADBAND;
  smooth AT %QD0 : REAL;
END_VAR
  filter(IN := raw, WIDTH := 1.0);
  smooth := filter.OUT;
END_PROGRAM
