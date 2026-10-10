FUNCTION Sub : INT
VAR_INPUT a : INT; b : INT; END_VAR
  Sub := a - b;
END_FUNCTION

PROGRAM Arguments
VAR
  x : INT;
END_VAR
  x := Sub(1, a := 2, b := 3);
END_PROGRAM
