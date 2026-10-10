PROGRAM Invert
VAR
  mask : BYTE := 15;
  above AT %QX0.0 : BOOL;
  same AT %QX0.1 : BOOL;
END_VAR
  above := (NOT mask) > 255;
  same := (NOT mask) = 240;
END_PROGRAM
