PROGRAM Conversions
VAR
  truth : BOOL := TRUE;
  zero : INT := 0;
  five : INT := 5;
  low : REAL := 2.4;
  high : REAL := 2.6;
  below : REAL := -2.6;
  as_int AT %QW0 : INT;
  from_zero AT %QX2.0 : BOOL;
  from_five AT %QX2.1 : BOOL;
  rounded_low AT %QD2 : REAL;
  rounded_high AT %QD3 : REAL;
  rounded_below AT %QD4 : REAL;
END_VAR
  as_int := BOOL_TO_INT(truth);
  from_zero := INT_TO_BOOL(zero);
  from_five := INT_TO_BOOL(five);
  rounded_low := ROUND(low);
  rounded_high := ROUND(high);
  rounded_below := ROUND(below);
END_PROGRAM
