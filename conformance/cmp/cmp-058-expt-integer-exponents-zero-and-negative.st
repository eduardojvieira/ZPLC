PROGRAM Powers
VAR
  base : REAL := 5.0;
  minus_base : REAL := -3.0;
  zero : REAL := 0.0;
  three : REAL := 3.0;
  i : INT;
  sum : REAL;
  q0 AT %QD0 : REAL;
  q1 AT %QD1 : REAL;
  q2 AT %QD2 : REAL;
  q3 AT %QD3 : REAL;
  q4 AT %QD4 : REAL;
  q5 AT %QD5 : REAL;
  q6 AT %QD6 : REAL;
  q7 AT %QD7 : REAL;
  q8 AT %QD8 : REAL;
  q9 AT %QD9 : REAL;
END_VAR
  q0 := EXPT(2.0, 8.0);
  q1 := EXPT(base, zero);
  q2 := EXPT(minus_base, zero);
  q3 := EXPT(zero, zero);
  q4 := EXPT(2.0, -2.0);
  q5 := EXPT(minus_base, three);
  q6 := EXPT(minus_base, 2.0);
  q7 := EXPT(2, 10);
  q8 := EXPT(zero, three);
  FOR i := 1 TO 20 DO
    sum := sum + EXPT(2.0, three);
  END_FOR;
  q9 := sum;
END_PROGRAM
