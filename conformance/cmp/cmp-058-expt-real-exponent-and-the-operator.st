PROGRAM RealPowers
VAR
  q0 AT %QX0.0 : BOOL;
  q1 AT %QX0.1 : BOOL;
  q2 AT %QX0.2 : BOOL;
  q3 AT %QX0.3 : BOOL;
  q4 AT %QX0.4 : BOOL;
  q5 AT %QX0.5 : BOOL;
END_VAR
  q0 := ABS((EXPT(9.0, 0.5)) - 3.0) < 1.0E-5;
  q1 := ABS((EXPT(2.0, 0.5)) - 1.4142135381698608) < 1.0E-5;
  q2 := ABS((EXPT(10.0, -1.5)) - 0.03162277489900589) < 1.0E-6;
  q3 := EXPT(7.0, 2.5) = 7.0 ** 2.5;
  q4 := (EXPT(-8.0, 0.5)) <> (EXPT(-8.0, 0.5));
  q5 := ABS((EXPT(1.0, 1000.0)) - 1.0) < 1.0E-6;
END_PROGRAM
