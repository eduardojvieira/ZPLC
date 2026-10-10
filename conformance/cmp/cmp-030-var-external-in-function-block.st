VAR_GLOBAL
  hits : INT;
END_VAR

FUNCTION_BLOCK Counter
VAR_EXTERNAL hits : INT; END_VAR
  hits := hits + 1;
END_FUNCTION_BLOCK

PROGRAM Shared
VAR
  a : Counter;
  b : Counter;
  seen AT %QW0 : INT;
END_VAR
  a();
  b();
  seen := hits;
END_PROGRAM
