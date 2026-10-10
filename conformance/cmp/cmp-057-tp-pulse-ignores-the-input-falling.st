PROGRAM PulseTimer
VAR
  trigger AT %IX0.0 : BOOL;
  shot : TP;
  q AT %QX0.0 : BOOL;
END_VAR
  shot(IN := trigger, PT := T#50ms);
  q := shot.Q;
END_PROGRAM
