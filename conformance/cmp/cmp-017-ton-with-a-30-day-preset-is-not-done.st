PROGRAM Delay
VAR
  wait : TON;
  done AT %QX0.0 : BOOL;
END_VAR
  wait(IN := TRUE, PT := T#30d);
  done := wait.Q;
END_PROGRAM
