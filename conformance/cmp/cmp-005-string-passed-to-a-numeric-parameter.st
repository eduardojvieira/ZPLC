FUNCTION Double : INT
VAR_INPUT
  x : INT;
END_VAR
  Double := x * 2;
END_FUNCTION

PROGRAM TextArgument
VAR
  text : STRING;
  n : INT;
END_VAR
  n := Double(x := text);
END_PROGRAM
