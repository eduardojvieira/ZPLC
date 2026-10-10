PROGRAM Accumulate
VAR
  acc : LREAL;
  n : LINT := 4294967295;
  o_acc AT %QD0 : LREAL;
  o_n AT %QD2 : LINT;
  o_kept AT %QD4 : LREAL;
END_VAR
VAR RETAIN
  kept : LREAL := 100.25;
END_VAR
  acc := acc + 0.1;
  n := n + 1;
  kept := kept * 2.0;
  o_acc := acc;
  o_n := n;
  o_kept := kept;
END_PROGRAM
