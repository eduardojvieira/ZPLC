PROGRAM SquareRoots
VAR
  big : REAL := 1.0E38;
  nan : REAL;
  q0 AT %QX0.0 : BOOL;
  q1 AT %QX0.1 : BOOL;
  q2 AT %QX0.2 : BOOL;
  q3 AT %QX0.3 : BOOL;
  q4 AT %QX0.4 : BOOL;
  q5 AT %QX0.5 : BOOL;
  q6 AT %QX0.6 : BOOL;
  q7 AT %QX0.7 : BOOL;
END_VAR
  nan := big * big;
  nan := nan - nan;
  q0 := ABS((SQRT(0.0)) - 0.0) < 1.0E-6;
  q1 := ABS((SQRT(-4.0)) - 0.0) < 1.0E-6;
  q2 := ABS((SQRT(16)) - 4.0) < 1.0E-6;
  q3 := ABS((SQRT(2.0)) - 1.4142135381698608) < 1.0E-6;
  q4 := ABS((SQRT(1.0E-40) * 1.0E20) - 1.0) < 1.0E-4;
  q5 := ABS((SQRT(2.0E38) / 1.0E19) - 1.4142135381698608) < 1.0E-5;
  q6 := ABS((SQRT(0.25)) - 0.5) < 1.0E-6;
  q7 := SQRT(nan) <> SQRT(nan);
END_PROGRAM
