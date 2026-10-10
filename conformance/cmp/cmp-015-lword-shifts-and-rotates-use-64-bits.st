PROGRAM Shifts
VAR
  v : LWORD := 16#8000000000000001;
  w : LWORD := 16#0123456789ABCDEF;
  l1 AT %QD0 : LWORD;
  l2 AT %QD2 : LWORD;
  l3 AT %QD4 : LWORD;
  l4 AT %QD6 : LWORD;
  r1 AT %QD8 : LWORD;
  r2 AT %QD10 : LWORD;
  r3 AT %QD12 : LWORD;
  r4 AT %QD14 : LWORD;
  o1 AT %QD16 : LWORD;
  o2 AT %QD18 : LWORD;
  o3 AT %QD20 : LWORD;
  o4 AT %QD22 : LWORD;
  p1 AT %QD24 : LWORD;
  p2 AT %QD26 : LWORD;
  p3 AT %QD28 : LWORD;
END_VAR
  l1 := SHL(v, 1);
  l2 := SHL(w, 32);
  l3 := SHL(w, 63);
  l4 := SHL(w, 64);
  r1 := SHR(v, 1);
  r2 := SHR(w, 36);
  r3 := SHR(v, 63);
  r4 := SHR(v, 64);
  o1 := ROL(v, 1);
  o2 := ROL(w, 40);
  o3 := ROL(w, 0);
  o4 := ROL(w, 64);
  p1 := ROR(v, 1);
  p2 := ROR(w, 12);
  p3 := ROR(w, 65);
END_PROGRAM
