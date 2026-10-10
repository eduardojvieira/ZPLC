PROGRAM Delay
VAR
  enable AT %IX0.0 : BOOL;
  t : TON;
  q AT %QX0.0 : BOOL;
END_VAR
  t(IN := enable, PT := T#0ms);
  q := t.Q;
END_PROGRAM
