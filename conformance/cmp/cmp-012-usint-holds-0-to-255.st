PROGRAM UsintRange
VAR
  a : USINT := 200;
  b : USINT := 55;
  sum AT %QD0 : DINT;
  above AT %QX4.0 : BOOL;
  top AT %QB5 : USINT;
END_VAR
  sum := a + b;
  above := a > b;
  top := 255;
END_PROGRAM
