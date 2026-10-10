FUNCTION Half : INT
VAR_INPUT a : INT; END_VAR
  Half := a / 2;
  Half := Half + missing;
END_FUNCTION

PROGRAM Caller
VAR
  seen AT %QW0 : INT;
END_VAR
  seen := Half(4);
END_PROGRAM
