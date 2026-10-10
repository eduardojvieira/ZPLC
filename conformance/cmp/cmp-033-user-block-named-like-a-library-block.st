FUNCTION_BLOCK Blink
VAR_OUTPUT level : INT; END_VAR
  level := 7;
END_FUNCTION_BLOCK

PROGRAM Own
VAR
  b : blink;
  seen AT %QW0 : INT;
END_VAR
  b();
  seen := b.level;
END_PROGRAM
