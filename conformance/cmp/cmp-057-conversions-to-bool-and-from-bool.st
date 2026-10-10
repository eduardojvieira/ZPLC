PROGRAM Booleans
VAR
  zero : REAL := 0.0;
  half : REAL := 0.5;
  minus_two : REAL := -2.0;
  minus_one : REAL := -1.0;
  big : REAL := 1.0E38;
  neg_zero : REAL;
  inf : REAL;
  nan : REAL;
  minus_int : INT := -1;
  high_only : DWORD := 16#10000;
  none : USINT := 0;
  yes : BOOL := TRUE;
  q0 AT %QX0.0 : BOOL;
  q1 AT %QX0.1 : BOOL;
  q2 AT %QX0.2 : BOOL;
  q3 AT %QX0.3 : BOOL;
  q4 AT %QX0.4 : BOOL;
  q5 AT %QX0.5 : BOOL;
  q6 AT %QX0.6 : BOOL;
  q7 AT %QX0.7 : BOOL;
  b0 AT %QB1 : USINT;
  b1 AT %QW1 : INT;
  b2 AT %QD1 : DINT;
END_VAR
  neg_zero := zero * minus_one;
  inf := big * big;
  nan := inf - inf;
  q0 := REAL_TO_BOOL(zero);
  q1 := REAL_TO_BOOL(half);
  q2 := REAL_TO_BOOL(minus_two);
  q3 := REAL_TO_BOOL(neg_zero);
  q4 := INT_TO_BOOL(minus_int);
  q5 := DWORD_TO_BOOL(high_only);
  q6 := USINT_TO_BOOL(none);
  q7 := REAL_TO_BOOL(nan);
  b0 := BOOL_TO_USINT(yes);
  b1 := BOOL_TO_INT(yes);
  b2 := BOOL_TO_DINT(yes);
END_PROGRAM
