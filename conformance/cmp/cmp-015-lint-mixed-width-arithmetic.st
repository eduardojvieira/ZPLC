PROGRAM Mixed
VAR
  small : DINT := -2147483648;
  unsigned : UDINT := 4294967295;
  wide : LINT := 1000000;
  s1 AT %QD0 : LINT;
  s2 AT %QD2 : LINT;
  s3 AT %QD4 : LINT;
  s4 AT %QD6 : LINT;
  s5 AT %QD8 : LINT;
  gt AT %QX512.0 : BOOL;
  ge_unsigned AT %QX512.1 : BOOL;
END_VAR
  s1 := wide * small;
  s2 := wide + unsigned;
  s3 := small - wide;
  s4 := wide * 4000000000;
  s5 := wide / small;
  gt := wide > small;
  ge_unsigned := wide * 5000 >= unsigned;
END_PROGRAM
