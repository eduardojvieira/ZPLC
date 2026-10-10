PROGRAM Main
VAR
  a : ARRAY[0..99] OF INT := [100(3)];
  first AT %QW0 : INT;
  last AT %QW1 : INT;
  after AT %QW2 : INT;
END_VAR
  first := a[0];
  last := a[99];
  after := a[50] + 4;
END_PROGRAM
