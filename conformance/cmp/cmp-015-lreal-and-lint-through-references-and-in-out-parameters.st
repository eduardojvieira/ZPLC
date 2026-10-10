FUNCTION_BLOCK Accumulate
VAR_IN_OUT
  total : LREAL;
  count : LINT;
END_VAR
VAR_INPUT
  step : LREAL;
END_VAR
  total := total + step;
  count := count + 1;
END_FUNCTION_BLOCK

PROGRAM WideReferences
VAR
  sum : LREAL;
  big : LINT := 5000000000;
  pd : REF_TO LREAL;
  pl : REF_TO LINT;
  acc : Accumulate;
  n : LINT;
  o_sum AT %QD0 : LREAL;
  o_big AT %QD2 : LINT;
  o_count AT %QD4 : LINT;
  o_through AT %QD6 : LREAL;
END_VAR
  pd := REF(sum);
  pl := REF(big);
  acc(total := sum, count := n, step := 0.5);
  acc(total := sum, count := n, step := 0.25);
  pd^ := pd^ + 1.0;
  pl^ := pl^ * 2;
  o_sum := sum;
  o_big := big;
  o_count := n;
  o_through := pd^ * 2.0;
END_PROGRAM
