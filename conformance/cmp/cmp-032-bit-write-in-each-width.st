PROGRAM Bits
VAR
  b AT %QB0 : BYTE;
  i AT %QW2 : INT;
  d AT %QD4 : DWORD;
END_VAR
  b.7 := TRUE;
  i.15 := TRUE;
  d.31 := TRUE;
  d.0 := TRUE;
END_PROGRAM
