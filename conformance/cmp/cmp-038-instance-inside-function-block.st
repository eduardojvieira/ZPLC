FUNCTION_BLOCK Debounce
VAR_INPUT sig : BOOL; END_VAR
VAR_OUTPUT out : BOOL; END_VAR
VAR tmr : TON; END_VAR
  tmr(IN := sig, PT := T#20ms);
  out := tmr.Q;
END_FUNCTION_BLOCK

PROGRAM Composition
VAR
  d : Debounce;
  settled AT %QX0.0 : BOOL;
END_VAR
  d(sig := TRUE);
  settled := d.out;
END_PROGRAM
