PROGRAM Logic
VAR
  a : BOOL := TRUE;
  b : BOOL := FALSE;
  c : BOOL := FALSE;
  seen AT %QX0.0 : BOOL;
END_VAR
  seen := a OR b & c;
END_PROGRAM
