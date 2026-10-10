PROGRAM Long
VAR
  a : TIME := T#30d;
  sum AT %QD0 : TIME;
  half AT %QD4 : TIME;
  bigger AT %QX8.0 : BOOL;
  smaller AT %QX8.1 : BOOL;
END_VAR
  sum := a + T#10d;
  half := a / 2;
  bigger := sum > T#35d;
  smaller := a < T#35d;
END_PROGRAM
