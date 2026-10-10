PROGRAM DoubleProduct
VAR
  a : LREAL := 0.1;
  three : LREAL := 3.0;
  seven : LREAL := 7.0;
  max : LREAL := 1.7976931348623157E308;
  min : LREAL := 2.2250738585072014E-308;
  two : LREAL := 2.0;
  neg : LREAL := -1.5;
  m1 AT %QD0 : LREAL;
  m2 AT %QD2 : LREAL;
  m3 AT %QD4 : LREAL;
  m4 AT %QD6 : LREAL;
  m5 AT %QD8 : LREAL;
  d1 AT %QD10 : LREAL;
  d2 AT %QD12 : LREAL;
  d3 AT %QD14 : LREAL;
  d4 AT %QD16 : LREAL;
END_VAR
  m1 := a * three;
  m2 := neg * neg;
  m3 := max * two;
  m4 := min / two;
  m5 := min / 4503599627370496.0;
  d1 := 1.0 / three;
  d2 := a / seven;
  d3 := max / two;
  d4 := neg / two;
END_PROGRAM
