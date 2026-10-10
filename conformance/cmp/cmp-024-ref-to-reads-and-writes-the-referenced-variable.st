PROGRAM Reference
VAR
  target : INT := 5;
  link : REF_TO INT;
  seen AT %QW0 : INT;
  moved AT %QW1 : INT;
END_VAR
  link := REF(target);
  seen := link^;
  link^ := 42;
  moved := target;
END_PROGRAM
