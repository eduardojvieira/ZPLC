PROGRAM Precise
VAR
  x : LREAL := 10000000000.0;
  grew AT %QX0.0 : BOOL;
END_VAR
  x := x + 1.0;
  grew := x > 10000000000.0;
END_PROGRAM
