PROGRAM DoubleCompare
VAR
  one : LREAL := 1.0;
  two : LREAL := 2.0;
  nzero : LREAL := -0.0;
  zero : LREAL := 0.0;
  max : LREAL := 1.7976931348623157E308;
  inf : LREAL;
  nan : LREAL;
  close : LREAL := 1.0000000000000002;
  lt AT %QX512.0 : BOOL;
  le AT %QX512.1 : BOOL;
  gt AT %QX512.2 : BOOL;
  ge AT %QX512.3 : BOOL;
  eq0 AT %QX512.4 : BOOL;
  lt0 AT %QX512.5 : BOOL;
  ne_close AT %QX512.6 : BOOL;
  lt_close AT %QX512.7 : BOOL;
  inf_gt AT %QX513.0 : BOOL;
  neg_inf_lt AT %QX513.1 : BOOL;
  nan_eq AT %QX513.2 : BOOL;
  nan_ne AT %QX513.3 : BOOL;
  nan_lt AT %QX513.4 : BOOL;
  nan_gt AT %QX513.5 : BOOL;
  nan_le AT %QX513.6 : BOOL;
  nan_ge AT %QX513.7 : BOOL;
  inf_eq AT %QX514.0 : BOOL;
END_VAR
  inf := max * 10.0;
  nan := inf - inf;
  lt := one < two;
  le := one <= one;
  gt := two > one;
  ge := two >= two;
  eq0 := nzero = zero;
  lt0 := nzero < zero;
  ne_close := one <> close;
  lt_close := one < close;
  inf_gt := inf > max;
  neg_inf_lt := -inf < -max;
  nan_eq := nan = nan;
  nan_ne := nan <> nan;
  nan_lt := nan < one;
  nan_gt := nan > one;
  nan_le := one <= nan;
  nan_ge := nan >= nan;
  inf_eq := inf = inf;
END_PROGRAM
