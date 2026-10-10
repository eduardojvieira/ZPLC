PROGRAM Scaling
VAR
  zero_range : REAL := 5.0;
  q0 AT %QD0 : REAL;
  q1 AT %QD1 : REAL;
  q2 AT %QD2 : REAL;
  q3 AT %QD3 : REAL;
  q4 AT %QD4 : REAL;
  q5 AT %QD5 : REAL;
  q6 AT %QD6 : REAL;
  q7 AT %QD7 : REAL;
  q8 AT %QD8 : REAL;
END_VAR
  q0 := NORM_X(-10.0, 0.0, 10.0);
  q1 := NORM_X(0.0, 5.0, 20.0);
  q2 := NORM_X(zero_range, zero_range, zero_range);
  q3 := NORM_X(0.0, 30.0, 20.0);
  q4 := NORM_X(-20.0, -15.0, -10.0);
  q5 := SCALE_X(-10.0, 0.5, 10.0);
  q6 := SCALE_X(0.0, 0.25, 20.0);
  q7 := SCALE_X(-5.0, 1.0, -1.0);
  q8 := SCALE_X(100.0, 0.0, 200.0);
END_PROGRAM
