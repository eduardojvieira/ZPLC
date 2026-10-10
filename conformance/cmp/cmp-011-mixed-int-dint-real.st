PROGRAM Mixed
VAR
  small : INT := -3;
  wide : DINT := 100000;
  ratio : REAL := 0.5;
  total AT %QD0 : DINT;
  scaled AT %QD4 : REAL;
END_VAR
  total := small + wide;
  scaled := small * ratio;
END_PROGRAM
