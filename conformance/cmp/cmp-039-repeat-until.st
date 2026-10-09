PROGRAM Loop
VAR
  i : INT;
  seen AT %QW0 : INT;
END_VAR
  i := 0;
  REPEAT
    i := i + 1;
  UNTIL i >= 3
  END_REPEAT;
  seen := i;
END_PROGRAM
