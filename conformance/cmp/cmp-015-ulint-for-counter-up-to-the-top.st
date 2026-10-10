PROGRAM TopFor
VAR
  k : ULINT;
  hits : ULINT;
  res_hits AT %QD0 : ULINT;
  res_k AT %QD2 : ULINT;
END_VAR
  FOR k := 18446744073709551610 TO 18446744073709551613 DO
    hits := hits + 1;
  END_FOR;
  res_hits := hits;
  res_k := k;
END_PROGRAM
