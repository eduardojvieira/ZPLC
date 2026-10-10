PROGRAM Saturate
VAR
  inf_source : REAL := 1.0E38;
  inf : REAL;
  nan : REAL;
  q0 AT %QB0 : SINT;
  q1 AT %QB1 : SINT;
  q2 AT %QB2 : USINT;
  q3 AT %QB3 : USINT;
  q4 AT %QW2 : INT;
  q5 AT %QW3 : INT;
  q6 AT %QW4 : UINT;
  q7 AT %QD3 : UDINT;
  q8 AT %QD4 : UDINT;
  q9 AT %QD5 : DINT;
  q10 AT %QD6 : DINT;
  q11 AT %QD7 : UDINT;
END_VAR
  inf := inf_source * inf_source;
  nan := inf - inf;
  q0 := REAL_TO_SINT(200.0);
  q1 := REAL_TO_SINT(-200.0);
  q2 := REAL_TO_USINT(300.0);
  q3 := REAL_TO_USINT(-5.0);
  q4 := REAL_TO_INT(40000.0);
  q5 := REAL_TO_INT(-40000.0);
  q6 := REAL_TO_UINT(70000.0);
  q7 := REAL_TO_UDINT(5.0E9);
  q8 := REAL_TO_UDINT(3.0E9);
  q9 := REAL_TO_DINT(nan);
  q10 := REAL_TO_DINT(0.0 - inf);
  q11 := REAL_TO_UDINT(inf);
END_PROGRAM
