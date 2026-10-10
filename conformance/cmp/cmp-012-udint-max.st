PROGRAM Largest
VAR
  top : UDINT := 4294967295;
  zero : UDINT := 0;
  gt AT %QX0.0 : BOOL;
  ge AT %QX0.1 : BOOL;
  lt AT %QX0.2 : BOOL;
  le AT %QX0.3 : BOOL;
  same AT %QX0.4 : BOOL;
END_VAR
  gt := top > zero;
  ge := top >= zero;
  lt := top < zero;
  le := top <= zero;
  same := top = 4294967295;
END_PROGRAM
