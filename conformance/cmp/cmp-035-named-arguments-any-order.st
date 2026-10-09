FUNCTION Sub : INT
VAR_INPUT a : INT; b : INT; END_VAR
  Sub := a - b;
END_FUNCTION

PROGRAM Arguments
VAR
  diff AT %QW0 : INT;
END_VAR
  diff := Sub(b := 1, a := 10);
END_PROGRAM
