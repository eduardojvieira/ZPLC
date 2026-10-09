PROGRAM Invert
VAR
  mask : BYTE := 15;
  inverted AT %QB0 : BYTE;
END_VAR
  inverted := NOT mask;
END_PROGRAM
