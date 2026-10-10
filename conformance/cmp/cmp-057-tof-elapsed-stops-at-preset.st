PROGRAM Delay
VAR
  n : INT;
  t : TOF;
  q AT %QX0.0 : BOOL;
  elapsed AT %QD1 : TIME;
END_VAR
  n := n + 1;
  t(IN := n <= 2, PT := T#50ms);
  q := t.Q;
  elapsed := t.ET;
END_PROGRAM
