PROGRAM Modulator
VAR
  run AT %IX0.0 : BOOL;
  none : PWM;
  q AT %QX0.0 : BOOL;
END_VAR
  none(ENABLE := run, PERIOD := T#0ms, DUTY := 0.5);
  q := none.Q;
END_PROGRAM
