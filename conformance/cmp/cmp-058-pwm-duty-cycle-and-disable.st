PROGRAM Modulator
VAR
  run AT %IX0.0 : BOOL;
  third : PWM;
  never : PWM;
  always : PWM;
  q AT %QX0.0 : BOOL;
  q_never AT %QX0.1 : BOOL;
  q_always AT %QX0.2 : BOOL;
END_VAR
  third(ENABLE := run, PERIOD := T#100ms, DUTY := 0.3);
  never(ENABLE := run, PERIOD := T#100ms, DUTY := 0.0);
  always(ENABLE := run, PERIOD := T#100ms, DUTY := 1.0);
  q := third.Q;
  q_never := never.Q;
  q_always := always.Q;
END_PROGRAM
