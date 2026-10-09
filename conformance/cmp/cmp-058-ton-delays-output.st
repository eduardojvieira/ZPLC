PROGRAM Timer
VAR
  t : TON;
  q AT %QX0.0 : BOOL;
END_VAR
  t(IN := TRUE, PT := T#50ms);
  q := t.Q;
END_PROGRAM
