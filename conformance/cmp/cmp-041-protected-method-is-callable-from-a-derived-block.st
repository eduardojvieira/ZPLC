FUNCTION_BLOCK Sensor
METHOD PROTECTED Raw : INT
  Raw := 21;
END_METHOD
METHOD PRIVATE Offset : INT
  Offset := 2;
END_METHOD
METHOD PUBLIC Corrected : INT
  Corrected := Raw() + Offset();
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Scaled EXTENDS Sensor
METHOD Doubled : INT
  Doubled := Raw() * 2;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Access
VAR
  s : Scaled;
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
  a := s.Corrected();
  b := s.Doubled();
END_PROGRAM
