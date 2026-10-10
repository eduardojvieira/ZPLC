PROGRAM Divide
VAR
  a : UDINT := 4000000000;
  b : UDINT := 3000000000;
  half : UDINT := 2147483648;
  small AT %QD0 : UDINT;
  big_q AT %QD4 : UDINT;
  big_r AT %QD8 : UDINT;
  mid_q AT %QD12 : UDINT;
  mod_small AT %QD16 : UDINT;
END_VAR
  small := a / 1000;
  big_q := a / b;
  big_r := a MOD b;
  mid_q := a / half;
  mod_small := a MOD 7;
END_PROGRAM
