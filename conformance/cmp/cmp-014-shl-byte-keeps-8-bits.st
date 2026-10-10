PROGRAM Shift
VAR
  b : BYTE := 200;
  past AT %QX0.0 : BOOL;
  shifted AT %QB1 : BYTE;
END_VAR
  past := SHL(b, 1) > 255;
  shifted := SHL(b, 1);
END_PROGRAM
