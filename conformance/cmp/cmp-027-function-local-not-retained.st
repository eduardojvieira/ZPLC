FUNCTION Count : INT
VAR_INPUT x : INT; END_VAR
VAR k : INT; END_VAR
  k := k + 1;
  Count := k;
END_FUNCTION

PROGRAM Calls
VAR
  first AT %QW0 : INT;
  second AT %QW1 : INT;
END_VAR
  first := Count(0);
  second := Count(0);
END_PROGRAM
