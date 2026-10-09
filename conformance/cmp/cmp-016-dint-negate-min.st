PROGRAM Negate
VAR
  a : DINT := -2147483647;
  q AT %QD0 : DINT;
END_VAR
  a := a - 1;
  q := -a;
END_PROGRAM
