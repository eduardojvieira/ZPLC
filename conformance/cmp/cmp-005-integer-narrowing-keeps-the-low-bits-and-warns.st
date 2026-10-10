PROGRAM Narrow
VAR
  wide : DINT := 70000;
  huge : LINT := 5000000000;
  small AT %QW0 : INT;
  low AT %QD1 : DINT;
END_VAR
  small := wide;
  low := huge;
END_PROGRAM
