PROGRAM Ties
VAR
  half : REAL := 0.5;
  one_half : REAL := 1.5;
  two_half : REAL := 2.5;
  three_half : REAL := 3.5;
  minus_half : REAL := -0.5;
  minus_one_half : REAL := -1.5;
  minus_two_half : REAL := -2.5;
  almost_half : REAL := 0.49999997;
  last_tie : REAL := 8388607.5;
  r0 AT %QW0 : INT;
  r1 AT %QW1 : INT;
  r2 AT %QW2 : INT;
  r3 AT %QW3 : INT;
  r4 AT %QW4 : INT;
  r5 AT %QW5 : INT;
  r6 AT %QW6 : INT;
  r7 AT %QW7 : INT;
  r8 AT %QD4 : DINT;
END_VAR
  r0 := REAL_TO_INT(half);
  r1 := REAL_TO_INT(one_half);
  r2 := REAL_TO_INT(two_half);
  r3 := REAL_TO_INT(three_half);
  r4 := REAL_TO_INT(minus_half);
  r5 := REAL_TO_INT(minus_one_half);
  r6 := REAL_TO_INT(minus_two_half);
  r7 := REAL_TO_INT(almost_half);
  r8 := REAL_TO_DINT(last_tie);
END_PROGRAM
