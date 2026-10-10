FUNCTION Parse : INT
VAR_INPUT
  text : STRING;
END_VAR
  Parse := text;
END_FUNCTION

PROGRAM TextReturn
VAR
  n : INT;
END_VAR
  n := Parse(text := 'x');
END_PROGRAM
