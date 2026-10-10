PROGRAM TimeValues
VAR
  after : TIME := T#1s500ms;
  q0 AT %QD0 : DINT;
  q1 AT %QD1 : TIME;
  q2 AT %QD2 : UDINT;
  q3 AT %QD3 : REAL;
  q4 AT %QD4 : TIME;
  q5 AT %QW10 : WORD;
END_VAR
  q0 := TIME_TO_DINT(T#2s);
  q1 := DINT_TO_TIME(1500);
  q2 := TIME_TO_UDINT(T#1h);
  q3 := TIME_TO_REAL(after);
  q4 := REAL_TO_TIME(2500.0);
  q5 := TIME_TO_WORD(T#70s);
END_PROGRAM
