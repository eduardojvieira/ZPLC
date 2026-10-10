PROGRAM Assign
VAR
  i : INT := -4;
  init : REAL := 7;
  copy AT %QD0 : REAL;
  seven AT %QD4 : REAL;
END_VAR
  copy := i;
  seven := init;
END_PROGRAM
