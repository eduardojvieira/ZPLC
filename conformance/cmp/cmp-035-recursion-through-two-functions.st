FUNCTION Ping : INT
VAR_INPUT n : INT; END_VAR
  IF n > 0 THEN
    Ping := Pong(n - 1);
  END_IF;
END_FUNCTION

FUNCTION Pong : INT
VAR_INPUT n : INT; END_VAR
  Pong := Ping(n);
END_FUNCTION

PROGRAM Recursion
VAR
  x : INT;
END_VAR
  x := Ping(3);
END_PROGRAM
