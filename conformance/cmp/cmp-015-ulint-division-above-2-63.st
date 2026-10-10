PROGRAM UnsignedQuotients
VAR
  top : ULINT := 18446744073709551615;
  mid : ULINT := 9223372036854775808;
  two : ULINT := 2;
  ten : ULINT := 10;
  three : ULINT := 3;
  seven : ULINT := 7;
  q1 AT %QD0 : ULINT;
  q2 AT %QD2 : ULINT;
  q3 AT %QD4 : ULINT;
  q4 AT %QD6 : ULINT;
  r1 AT %QD8 : ULINT;
  r2 AT %QD10 : ULINT;
  r3 AT %QD12 : ULINT;
END_VAR
  q1 := top / two;
  q2 := mid / three;
  q3 := top / top;
  q4 := two / top;
  r1 := top MOD ten;
  r2 := mid MOD seven;
  r3 := top MOD mid;
END_PROGRAM
