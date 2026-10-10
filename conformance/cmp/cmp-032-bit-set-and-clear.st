PROGRAM Bits
VAR
  w AT %QW0 : WORD;
END_VAR
  w := 0;
  w.3 := TRUE;
  w.0 := TRUE;
  w.3 := FALSE;
  w.15 := TRUE;
END_PROGRAM
