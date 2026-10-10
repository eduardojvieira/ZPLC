PROGRAM Power
VAR
  d1 : REAL;
  d2 : REAL;
  d3 : REAL;
  d4 : REAL;
  root AT %QX0.0 : BOOL;
  cube AT %QX0.1 : BOOL;
  big AT %QX0.2 : BOOL;
  small AT %QX0.3 : BOOL;
END_VAR
  d1 := 9.0 ** 0.5 - 3.0;
  d2 := 27.0 ** (1.0 / 3.0) - 3.0;
  d3 := 10.0 ** 2.5 / 316.227766 - 1.0;
  d4 := 0.5 ** 1.5 / 0.35355339 - 1.0;
  root := (d1 < 0.0001) AND (d1 > -0.0001);
  cube := (d2 < 0.0001) AND (d2 > -0.0001);
  big := (d3 < 0.00005) AND (d3 > -0.00005);
  small := (d4 < 0.00005) AND (d4 > -0.00005);
END_PROGRAM
