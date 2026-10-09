PROGRAM Timer
VAR
  t : TOF;
  n : INT;
  q AT %QX0.0 : BOOL;
END_VAR
  n := n + 1;
  t(IN := n <= 2, PT := T#50ms);
  q := t.Q;
END_PROGRAM
