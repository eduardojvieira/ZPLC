PROGRAM Modulator
VAR
  run AT %IX0.0 : BOOL;
  third : PWM;
  never : PWM;
  always : PWM;
  whole : PWM;
  q AT %QX0.0 : BOOL;
  q_never AT %QX0.1 : BOOL;
  q_always AT %QX0.2 : BOOL;
  q_whole AT %QX0.3 : BOOL;
END_VAR
  third(ENABLE := run, PERIOD := T#100ms, DUTY := 0.3);
  never(ENABLE := run, PERIOD := T#100ms, DUTY := 0.0);
  always(ENABLE := run, PERIOD := T#100ms, DUTY := 1.0);
  whole(ENABLE := run, PERIOD := T#100ms, DUTY := 1);
  q := third.Q;
  q_never := never.Q;
  q_always := always.Q;
  q_whole := whole.Q;
END_PROGRAM
