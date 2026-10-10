PROGRAM Accumulator
VAR
  rate AT %ID0 : REAL;
  clear AT %IX8.0 : BOOL;
  total : INTEGRAL;
  out AT %QD0 : REAL;
END_VAR
  total(IN := rate, DT := 0.5, RESET := clear);
  out := total.OUT;
END_PROGRAM
