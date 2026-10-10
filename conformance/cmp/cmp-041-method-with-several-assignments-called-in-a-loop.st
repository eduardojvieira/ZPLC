FUNCTION_BLOCK Chooser
VAR
  calls : INT;
END_VAR
METHOD Pick : INT
VAR_INPUT
  x : INT;
END_VAR
  Pick := x;
  IF x > 5 THEN
    Pick := x * 2;
  END_IF;
  IF x > 8 THEN
    Pick := 0 - x;
  END_IF;
  calls := calls + 1;
END_METHOD
METHOD Never : INT
  calls := calls + 100;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Loop
VAR
  c : Chooser;
  i : INT;
  total : INT;
  nothing : INT := 7;
  q0 AT %QW0 : INT;
  q1 AT %QW1 : INT;
  q2 AT %QW2 : INT;
END_VAR
  total := 0;
  FOR i := 1 TO 10 DO
    total := total + c.Pick(i);
  END_FOR;
  nothing := c.Never();
  c.Pick(3);
  q0 := total;
  q1 := c.calls;
  q2 := nothing;
END_PROGRAM
