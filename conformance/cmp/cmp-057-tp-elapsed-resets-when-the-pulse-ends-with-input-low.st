PROGRAM Pulse
VAR
  trigger AT %IX0.0 : BOOL;
  shot : TP;
  q AT %QX0.0 : BOOL;
  elapsed AT %QD1 : TIME;
END_VAR
  shot(IN := trigger, PT := T#30ms);
  q := shot.Q;
  elapsed := shot.ET;
END_PROGRAM
