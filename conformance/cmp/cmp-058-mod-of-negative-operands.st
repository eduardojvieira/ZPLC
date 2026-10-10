PROGRAM Remainders
VAR
  a : INT := -7;
  b : INT := 3;
  c : INT := 7;
  d : INT := -3;
  big : DINT := -2147483647;
  q0 AT %QW0 : INT;
  q1 AT %QW1 : INT;
  q2 AT %QW2 : INT;
  q3 AT %QW3 : INT;
  q4 AT %QD2 : DINT;
END_VAR
  q0 := a MOD b;
  q1 := c MOD d;
  q2 := a MOD d;
  q3 := c MOD b;
  q4 := big MOD 10;
END_PROGRAM
