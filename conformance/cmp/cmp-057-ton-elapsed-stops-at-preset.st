PROGRAM Timer
VAR
  t : TON;
  elapsed AT %QD0 : TIME;
END_VAR
  t(IN := TRUE, PT := T#50ms);
  elapsed := t.ET;
END_PROGRAM
