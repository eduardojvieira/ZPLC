FUNCTION_BLOCK Delay
VAR_INPUT go : BOOL; END_VAR
VAR_OUTPUT done : BOOL; END_VAR
VAR t : TON; END_VAR
  t(IN := go, PT := T#25ms);
  done := t.Q;
END_FUNCTION_BLOCK

PROGRAM Composition
VAR
  fast : Delay;
  idle : Delay;
  a AT %QX0.0 : BOOL;
  b AT %QX0.1 : BOOL;
END_VAR
  fast(go := TRUE);
  idle(go := FALSE);
  a := fast.done;
  b := idle.done;
END_PROGRAM
