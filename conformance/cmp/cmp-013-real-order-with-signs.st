PROGRAM Order
VAR
  a : REAL := -2.5;
  b : REAL := -1.5;
  c : REAL := 0.0;
  d : REAL := 3.25;
  ab AT %QX0.0 : BOOL;
  bc AT %QX0.1 : BOOL;
  cd AT %QX0.2 : BOOL;
  ba AT %QX0.3 : BOOL;
  aa_le AT %QX0.4 : BOOL;
  dc_ge AT %QX0.5 : BOOL;
  ac_gt AT %QX0.6 : BOOL;
END_VAR
  ab := a < b;
  bc := b < c;
  cd := c < d;
  ba := b < a;
  aa_le := a <= a;
  dc_ge := d >= c;
  ac_gt := a > c;
END_PROGRAM
