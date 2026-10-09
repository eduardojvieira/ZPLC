PROGRAM Safe
VAR
  zero : INT;
  lamp AT %QX0.0 : BOOL;
  other AT %QW1 : INT;
END_VAR
  lamp := TRUE;
  other := 100 / zero;
END_PROGRAM
