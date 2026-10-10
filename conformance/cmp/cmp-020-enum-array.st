TYPE St : (IDLE, RUN, FAULT); END_TYPE

PROGRAM Main
VAR
  a : ARRAY[0..2] OF St;
  one AT %QW0 : INT;
  two AT %QW1 : INT;
  zero AT %QW2 : INT;
END_VAR
  a[1] := RUN;
  a[2] := FAULT;
  one := a[1];
  two := a[2];
  zero := a[0];
END_PROGRAM
