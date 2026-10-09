PROGRAM Invert
VAR
  mask : WORD := 255;
  inverted AT %QW0 : WORD;
END_VAR
  inverted := NOT mask;
END_PROGRAM
