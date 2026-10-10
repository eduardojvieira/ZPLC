PROGRAM Pulses
VAR
  trigger AT %IX0.0 : BOOL;
  shot : TP;
  q AT %QX0.0 : BOOL;
  elapsed AT %QD1 : TIME;
END_VAR
  shot(IN := trigger, PT := T#40ms);
  q := shot.Q;
  elapsed := shot.ET;
END_PROGRAM
