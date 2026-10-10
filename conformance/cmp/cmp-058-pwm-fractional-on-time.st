PROGRAM Modulator
VAR
  run AT %IX0.0 : BOOL;
  slow : PWM;
  q AT %QX0.0 : BOOL;
END_VAR
  slow(ENABLE := run, PERIOD := T#1000ms, DUTY := 0.0305);
  q := slow.Q;
END_PROGRAM
