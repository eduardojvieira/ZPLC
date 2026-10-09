FUNCTION_BLOCK Bumper
VAR c : INT; END_VAR
METHOD Bump : INT
  THIS.c := THIS.c + 1;
  Bump := THIS.c;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Methods
VAR
  m : Bumper;
  seen AT %QW0 : INT;
END_VAR
  seen := m.Bump();
END_PROGRAM
