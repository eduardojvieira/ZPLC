PROGRAM Composition
VAR
  timers : ARRAY[0..1] OF TON;
  done AT %QX0.0 : BOOL;
END_VAR
  timers[0](IN := TRUE, PT := T#10ms);
  done := timers[0].Q;
END_PROGRAM
