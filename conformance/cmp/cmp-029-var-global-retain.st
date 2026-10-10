VAR_GLOBAL RETAIN
  total : INT;
END_VAR

PROGRAM Totals
VAR
  seen AT %QW0 : INT;
END_VAR
  total := total + 2;
  seen := total;
END_PROGRAM
