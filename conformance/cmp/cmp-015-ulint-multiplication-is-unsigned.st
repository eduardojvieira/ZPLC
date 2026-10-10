PROGRAM UnsignedProduct
VAR
  big : ULINT := 18446744073709551615;
  half : ULINT := 9223372036854775808;
  t : ULINT := 3;
  w : LWORD := 16#0123456789ABCDEF;
  p1 AT %QD0 : ULINT;
  p2 AT %QD2 : ULINT;
  p3 AT %QD4 : LWORD;
  p4 AT %QD6 : ULINT;
END_VAR
  p1 := big * big;
  p2 := half * t;
  p3 := w * 16#10;
  p4 := half * 2;
END_PROGRAM
