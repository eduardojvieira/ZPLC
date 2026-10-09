PROGRAM Loop
VAR
  i : INT;
  steps AT %QW0 : INT;
END_VAR
  steps := 0;
  FOR i := 3 TO 1 BY -1 DO
    steps := steps + 1;
  END_FOR;
END_PROGRAM
