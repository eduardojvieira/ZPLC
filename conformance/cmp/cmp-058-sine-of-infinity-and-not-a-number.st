PROGRAM Infinite
VAR
  big : REAL := 1.0E38;
  inf : REAL;
  nan : REAL;
  q0 AT %QX0.0 : BOOL;
  q1 AT %QX0.1 : BOOL;
  q2 AT %QX0.2 : BOOL;
  q3 AT %QX0.3 : BOOL;
  q4 AT %QX0.4 : BOOL;
  q5 AT %QX0.5 : BOOL;
END_VAR
  inf := big * big;
  nan := inf - inf;
  q0 := SIN(inf) <> SIN(inf);
  q1 := COS(0.0 - inf) <> COS(0.0 - inf);
  q2 := TAN(inf) <> TAN(inf);
  q3 := SIN(nan) <> SIN(nan);
  q4 := COS(nan) <> COS(nan);
  q5 := SIN(1.0) = SIN(1.0);
END_PROGRAM
