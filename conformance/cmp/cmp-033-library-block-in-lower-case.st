PROGRAM Timer
VAR
  t : ton;
  done AT %QX0.0 : BOOL;
END_VAR
  t(IN := TRUE, PT := T#20ms);
  done := t.Q;
END_PROGRAM
