PROGRAM DoubleMixed
VAR
  d : LREAL := 0.5;
  i : DINT := -3;
  u : UDINT := 4294967295;
  l : LINT := 9007199254740993;
  r : REAL := 0.1;
  w : ULINT := 18446744073709551615;
  m1 AT %QD0 : LREAL;
  m2 AT %QD2 : LREAL;
  m3 AT %QD4 : LREAL;
  m4 AT %QD6 : LREAL;
  m5 AT %QD8 : LREAL;
  m6 AT %QD10 : REAL;
  m7 AT %QD11 : LREAL;
  m8 AT %QD13 : LREAL;
  m9 AT %QD15 : LREAL;
END_VAR
  m1 := d + i;
  m2 := d * u;
  m3 := d + l;
  m4 := d + r;
  m5 := w * 1.0;
  m6 := r + 1;
  m7 := i;
  m8 := u;
  m9 := l;
END_PROGRAM
