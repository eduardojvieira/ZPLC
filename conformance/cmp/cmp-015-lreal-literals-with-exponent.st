PROGRAM DoubleLiterals
VAR
  a : LREAL := 1.0E-3;
  b : LREAL := 1.5E2;
  c : LREAL := 2.5e-3;
  d : LREAL := 1.7976931348623157E308;
  e : LREAL := 4.9E-324;
  f : LREAL := -123456789.123456789;
  g : LREAL := 3.141592653589793;
  h : LREAL := 100;
  i : LREAL := -7;
  j : LREAL := 1.0E+10;
  o_a AT %QD0 : LREAL;
  o_b AT %QD2 : LREAL;
  o_c AT %QD4 : LREAL;
  o_d AT %QD6 : LREAL;
  o_e AT %QD8 : LREAL;
  o_f AT %QD10 : LREAL;
  o_g AT %QD12 : LREAL;
  o_h AT %QD14 : LREAL;
  o_i AT %QD16 : LREAL;
  o_j AT %QD18 : LREAL;
END_VAR
  o_a := a;
  o_b := b;
  o_c := c;
  o_d := d;
  o_e := e;
  o_f := f;
  o_g := g;
  o_h := h;
  o_i := i;
  o_j := j;
END_PROGRAM
