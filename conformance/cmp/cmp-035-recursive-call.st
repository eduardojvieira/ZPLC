FUNCTION Fact : INT
VAR_INPUT n : INT; END_VAR
  IF n <= 1 THEN
    Fact := 1;
  ELSE
    Fact := n * Fact(n - 1);
  END_IF;
END_FUNCTION

PROGRAM Recursion
VAR
  x : INT;
END_VAR
  x := Fact(5);
END_PROGRAM
