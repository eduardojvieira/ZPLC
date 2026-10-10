VAR_GLOBAL RETAIN
  total : INT := 10;
END_VAR

PROGRAM Totals
VAR
  seen AT %QW0 : INT;
END_VAR
  total := total + 1;
  seen := total;
END_PROGRAM
