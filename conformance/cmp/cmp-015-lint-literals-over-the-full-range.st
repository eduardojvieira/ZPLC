PROGRAM Literals
VAR
  a : LINT := -9223372036854775808;
  b : LINT := 9223372036854775807;
  c : ULINT := 18446744073709551615;
  d : LWORD := 16#FFFFFFFFFFFFFFFF;
  e : LWORD := 16#DEADBEEFCAFEBABE;
  f : LINT := 16#7FFFFFFFFFFFFFFF;
  g : ULINT := 8#1777777777777777777777;
  h : LWORD := 2#1000000000000000000000000000000000000000000000000000000000000001;
  i : LINT := LINT#-9;
  j : LWORD := LWORD#16#FF00;
  k : LREAL := LREAL#0.1;
  o_a AT %QD0 : LINT;
  o_b AT %QD2 : LINT;
  o_f AT %QD4 : LINT;
  o_c AT %QD6 : ULINT;
  o_d AT %QD8 : LWORD;
  o_e AT %QD10 : LWORD;
  o_g AT %QD12 : ULINT;
  o_h AT %QD14 : LWORD;
  o_i AT %QD16 : LINT;
  o_j AT %QD18 : LWORD;
  o_k AT %QD20 : LREAL;
  o_typed AT %QD22 : LINT;
END_VAR
  o_a := a;
  o_b := b;
  o_f := f;
  o_c := c;
  o_d := d;
  o_e := e;
  o_g := g;
  o_h := h;
  o_i := i;
  o_j := j;
  o_k := k;
  o_typed := LINT#4294967296 + LINT#1;
END_PROGRAM
