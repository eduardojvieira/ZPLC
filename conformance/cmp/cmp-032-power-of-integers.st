PROGRAM Power
VAR
  a : INT := 2;
  r AT %QD0 : REAL;
  s AT %QD4 : REAL;
END_VAR
  r := 2 ** 10;
  s := a ** 3;
END_PROGRAM
