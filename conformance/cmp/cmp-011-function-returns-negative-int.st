FUNCTION Negate : INT
VAR_INPUT
  x : INT;
END_VAR
  Negate := 0 - x;
END_FUNCTION

PROGRAM Caller
VAR
  r AT %QW0 : INT;
  below AT %QX2.0 : BOOL;
END_VAR
  r := Negate(5);
  below := Negate(5) < 0;
END_PROGRAM
