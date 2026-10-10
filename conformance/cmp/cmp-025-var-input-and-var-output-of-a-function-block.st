FUNCTION_BLOCK Accumulate
VAR_INPUT step : INT; END_VAR
VAR_OUTPUT total : INT; END_VAR
  total := total + step;
END_FUNCTION_BLOCK

PROGRAM Inputs
VAR
  acc : Accumulate;
  result AT %QW0 : INT;
END_VAR
  acc(step := 3);
  result := acc.total;
END_PROGRAM
