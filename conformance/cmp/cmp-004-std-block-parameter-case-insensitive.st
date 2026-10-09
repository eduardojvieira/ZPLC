PROGRAM Timer
VAR
  t : TON;
  done AT %QX0.0 : BOOL;
END_VAR
  t(in := TRUE, pt := T#10ms);
  done := t.Q;
END_PROGRAM
