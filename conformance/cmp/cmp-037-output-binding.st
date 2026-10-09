PROGRAM Binding
VAR
  t : TON;
  done AT %QX0.0 : BOOL;
END_VAR
  t(IN := TRUE, PT := T#10ms, Q => done);
END_PROGRAM
