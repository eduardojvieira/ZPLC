PROGRAM Selection
VAR
  yes : BOOL := TRUE;
  no : BOOL := FALSE;
  last : INT := 2;
  beyond : INT := 3;
  below : INT := -1;
  q0 AT %QW0 : INT;
  q1 AT %QW1 : INT;
  q2 AT %QD1 : REAL;
  q3 AT %QW4 : INT;
  q4 AT %QW5 : INT;
  q5 AT %QW6 : INT;
  q6 AT %QW7 : INT;
  q7 AT %QD4 : REAL;
END_VAR
  q0 := SEL(no, -5, 7);
  q1 := SEL(yes, -5, 7);
  q2 := SEL(yes, 1.5, -2.5);
  q3 := MUX(0, -10, 20, 30);
  q4 := MUX(last, -10, 20, 30);
  q5 := MUX(beyond, -10, 20, 30);
  q6 := MUX(below, -10, 20, 30);
  q7 := MUX(1, -1.5, 2.5);
END_PROGRAM
