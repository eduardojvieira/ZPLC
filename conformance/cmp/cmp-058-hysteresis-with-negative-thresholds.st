PROGRAM Cold
VAR
  level AT %ID0 : REAL;
  band : HYSTERESIS;
  q AT %QX0.0 : BOOL;
END_VAR
  band(IN := level, HIGH := -2.0, LOW := -6.0);
  q := band.Q;
END_PROGRAM
