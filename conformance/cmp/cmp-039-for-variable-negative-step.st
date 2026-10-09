PROGRAM Loop
VAR
  i : DINT;
  step : DINT := -2;
  steps AT %QW0 : INT;
END_VAR
  steps := 0;
  FOR i := 6 TO 1 BY step DO
    steps := steps + 1;
  END_FOR;
END_PROGRAM
