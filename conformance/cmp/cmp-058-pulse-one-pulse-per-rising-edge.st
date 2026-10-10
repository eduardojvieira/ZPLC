PROGRAM Strobe
VAR
  trigger AT %IX0.0 : BOOL;
  shot : PULSE;
  q AT %QX0.0 : BOOL;
END_VAR
  shot(TRIG := trigger, PT := T#30ms);
  q := shot.Q;
END_PROGRAM
