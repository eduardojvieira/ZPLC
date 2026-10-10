FUNCTION Sub3 : INT
VAR_INPUT a : INT; b : INT; c : INT; END_VAR
  Sub3 := a - b - c;
END_FUNCTION

PROGRAM Arguments
VAR
  mixed AT %QW0 : INT;
  named AT %QW1 : INT;
END_VAR
  mixed := Sub3(10, c := 1, b := 2);
  named := Sub3(c := 1, a := 10, b := 2);
END_PROGRAM
