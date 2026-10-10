PROGRAM Slope
VAR
  signal AT %ID0 : REAL;
  step : INT;
  d : DERIVATIVE;
  none : DERIVATIVE;
  rate AT %QD0 : REAL;
  guarded AT %QD1 : REAL;
END_VAR
  d(IN := signal, DT := 0.5);
  none(IN := signal, DT := 0.0);
  rate := d.OUT;
  guarded := none.OUT;
END_PROGRAM
