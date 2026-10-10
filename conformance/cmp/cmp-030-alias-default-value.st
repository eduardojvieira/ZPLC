TYPE Limit : INT := 100; END_TYPE

PROGRAM Defaults
VAR
  a : Limit;
  b : Limit := 7;
  sum AT %QW0 : INT;
END_VAR
  sum := a + b;
END_PROGRAM
