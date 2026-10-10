PROGRAM Signs
VAR
  neg : REAL := -3.5;
  pos : REAL := 2.5;
  zero : REAL := 0.0;
  big : REAL := -1.0E30;
  q0 AT %QD0 : REAL;
  q1 AT %QD1 : REAL;
  q2 AT %QD2 : REAL;
  q3 AT %QD3 : REAL;
  q4 AT %QD4 : REAL;
  q5 AT %QD5 : REAL;
  q6 AT %QD6 : REAL;
  q7 AT %QD7 : REAL;
END_VAR
  q0 := ABSF(neg);
  q1 := ABSF(pos);
  q2 := ABSF(zero);
  q3 := ABSF(big);
  q4 := NEGF(pos);
  q5 := NEGF(neg);
  q6 := NEGF(zero);
  q7 := NEGF(big);
END_PROGRAM
