FUNCTION Sub : INT
VAR_INPUT a : INT; b : INT; END_VAR
  Sub := a - b;
END_FUNCTION

PROGRAM Arguments
VAR
  x : INT;
END_VAR
  x := Sub(a := 1, 2);
END_PROGRAM
