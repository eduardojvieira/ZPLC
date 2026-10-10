PROGRAM Calls
VAR
  Call AT %IX0.0 : BOOL;
  Skip AT %IX0.1 : BOOL;
  OnTrue : RS;
  OnFalse : RS;
  Ran AT %QW1 : INT;
  A AT %QX0.0 : BOOL;
  B AT %QX0.1 : BOOL;
END_VAR
  LD Call
  CALC OnTrue(S := TRUE, R1 := FALSE)
  LD Skip
  CALCN OnFalse(S := TRUE, R1 := FALSE)
  LD OnTrue.Q1
  ST A
  LD OnFalse.Q1
  ST B
  LD Call
  RETC
  LD Ran
  ADD 1
  ST Ran
END_PROGRAM
