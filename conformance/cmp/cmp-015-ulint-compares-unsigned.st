PROGRAM Unsigned
VAR
  top : ULINT := 18446744073709551615;
  mask : LWORD := 4294967296;
  all_ones : LWORD := 18446744073709551615;
  above AT %QX0.0 : BOOL;
  and_high AT %QX0.1 : BOOL;
  not_zero AT %QX0.2 : BOOL;
  xor_self AT %QX0.3 : BOOL;
END_VAR
  above := top > 1;
  and_high := (all_ones AND mask) = mask;
  not_zero := NOT mask = 18446744069414584319;
  xor_self := (all_ones XOR all_ones) = 0;
END_PROGRAM
