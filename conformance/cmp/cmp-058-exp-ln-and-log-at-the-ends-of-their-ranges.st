PROGRAM Exponentials
VAR
  q0 AT %QX0.0 : BOOL;
  q1 AT %QX0.1 : BOOL;
  q2 AT %QX0.2 : BOOL;
  q3 AT %QX0.3 : BOOL;
  q4 AT %QX0.4 : BOOL;
  q5 AT %QX0.5 : BOOL;
  q6 AT %QX0.6 : BOOL;
  q7 AT %QX0.7 : BOOL;
  q8 AT %QX1.0 : BOOL;
  q9 AT %QX1.1 : BOOL;
  q10 AT %QX1.2 : BOOL;
  q11 AT %QX1.3 : BOOL;
  q12 AT %QX1.4 : BOOL;
END_VAR
  q0 := ABS((EXP(-20.0) / 2.0611536E-9) - 1.0) < 1.0E-5;
  q1 := ABS((EXP(0.0)) - 1.0) < 1.0E-6;
  q2 := ABS((EXP(88.0) / 1.6516363E38) - 1.0) < 1.0E-5;
  q3 := EXP(100.0) > 3.0E38;
  q4 := EXP(-110.0) = 0.0;
  q5 := ABS((LN(1.0)) - 0.0) < 1.0E-6;
  q6 := ABS((LN(0.5)) - -0.6931471824645996) < 1.0E-6;
  q7 := ABS((LN(1.0E-40)) - -92.10340118408203) < 1.0E-4;
  q8 := LN(0.0) < -3.0E38;
  q9 := (LN(-1.0)) <> (LN(-1.0));
  q10 := ABS((LOG(100.0)) - 2.0) < 1.0E-6;
  q11 := ABS((LOG(0.001)) - -3.0) < 1.0E-6;
  q12 := ABS((LOG(1.0E30)) - 30.0) < 1.0E-5;
END_PROGRAM
