PROGRAM Wrap
VAR
  a : DINT := 100000;
  q AT %QD0 : DINT;
END_VAR
  q := a * a;
END_PROGRAM
