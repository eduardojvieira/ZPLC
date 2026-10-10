FUNCTION Peek : INT
VAR_INPUT r : REF_TO INT; END_VAR
  Peek := r^;
END_FUNCTION

PROGRAM Main
VAR
  v : INT := 41;
  seen AT %QW0 : INT;
END_VAR
  seen := Peek(REF(v)) + 1;
END_PROGRAM
