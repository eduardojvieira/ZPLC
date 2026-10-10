PROGRAM Invert
VAR
  mask : DWORD := 255;
  inverted AT %QD0 : DWORD;
END_VAR
  inverted := NOT mask;
END_PROGRAM
