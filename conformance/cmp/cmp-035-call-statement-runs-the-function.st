VAR_GLOBAL
  counter : INT;
END_VAR

FUNCTION Bump : INT
VAR_INPUT amount : INT; END_VAR
VAR_EXTERNAL counter : INT; END_VAR
  counter := counter + amount;
  Bump := counter;
END_FUNCTION

PROGRAM Statement
VAR
  seen AT %QW0 : INT;
END_VAR
  Bump(2);
  Bump(amount := 3);
  seen := counter;
END_PROGRAM
