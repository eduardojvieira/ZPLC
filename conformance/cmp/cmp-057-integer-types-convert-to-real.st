PROGRAM ToReal
VAR
  s : SINT := -3;
  us : USINT := 200;
  ui : UINT := 60000;
  d : DINT := -70000;
  ud : UDINT := 3000000000;
  w : WORD := 40000;
  dw : DWORD := 16#80000000;
  b : BYTE := 255;
  t : BOOL := TRUE;
  r0 AT %QD0 : REAL;
  r1 AT %QD1 : REAL;
  r2 AT %QD2 : REAL;
  r3 AT %QD3 : REAL;
  r4 AT %QD4 : REAL;
  r5 AT %QD5 : REAL;
  r6 AT %QD6 : REAL;
  r7 AT %QD7 : REAL;
  r8 AT %QD8 : REAL;
END_VAR
  r0 := SINT_TO_REAL(s);
  r1 := USINT_TO_REAL(us);
  r2 := UINT_TO_REAL(ui);
  r3 := DINT_TO_REAL(d);
  r4 := UDINT_TO_REAL(ud);
  r5 := WORD_TO_REAL(w);
  r6 := DWORD_TO_REAL(dw);
  r7 := BYTE_TO_REAL(b);
  r8 := BOOL_TO_REAL(t);
END_PROGRAM
