PROGRAM NotANumber
VAR
  big : REAL := 1.0E38;
  inf : REAL;
  nan : REAL;
  q AT %QD0 : DINT := 7;
END_VAR
  inf := big * big;
  nan := inf - inf;
  q := REAL_TO_INT(nan);
END_PROGRAM
