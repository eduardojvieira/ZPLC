PROGRAM Order
VAR
  sl : LINT := -1;
  su : ULINT := 18446744073709551615;
  zero : LINT := 0;
  zu : ULINT := 0;
  lo : LINT := -9223372036854775808;
  hi : LINT := 9223372036854775807;
  w1 : LWORD := 16#8000000000000000;
  w2 : LWORD := 16#7FFFFFFFFFFFFFFF;
  a AT %QX512.0 : BOOL;
  b AT %QX512.1 : BOOL;
  c AT %QX512.2 : BOOL;
  d AT %QX512.3 : BOOL;
  e AT %QX512.4 : BOOL;
  f AT %QX512.5 : BOOL;
  g AT %QX512.6 : BOOL;
  h AT %QX512.7 : BOOL;
  i AT %QX513.0 : BOOL;
  j AT %QX513.1 : BOOL;
  k AT %QX513.2 : BOOL;
END_VAR
  a := sl < zero;
  b := su > zu;
  c := lo < hi;
  d := lo <= lo;
  e := hi >= hi;
  f := w1 > w2;
  g := w1 = 16#8000000000000000;
  h := sl <> zero;
  i := hi > lo;
  j := su < zu;
  k := (lo + hi) = -1;
END_PROGRAM
