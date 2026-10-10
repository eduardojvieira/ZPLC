PROGRAM Unordered
VAR
  bits AT %ID0 : DWORD;
  nan AT %ID0 : REAL;
  one : REAL := 1.0;
  eq_self AT %QX0.0 : BOOL;
  ne_self AT %QX0.1 : BOOL;
  lt_one AT %QX0.2 : BOOL;
  ge_one AT %QX0.3 : BOOL;
  gt_one AT %QX0.4 : BOOL;
  le_one AT %QX0.5 : BOOL;
END_VAR
  eq_self := nan = nan;
  ne_self := nan <> nan;
  lt_one := nan < one;
  ge_one := nan >= one;
  gt_one := one > nan;
  le_one := one <= nan;
END_PROGRAM
