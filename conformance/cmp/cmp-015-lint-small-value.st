PROGRAM Wide
VAR
  count : LINT := 5;
  ok AT %QX0.0 : BOOL;
END_VAR
  count := count + 1;
  ok := count = 6;
END_PROGRAM
