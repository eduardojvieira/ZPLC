PROGRAM Types
VAR
  s : SINT := -3;
  u : USINT := 200;
  i : INT := 1000;
  d : DINT;
  r : REAL;
  wide AT %QD0 : DINT;
  real_out AT %QD1 : REAL;
  unsigned_out AT %QW4 : INT;
END_VAR
  d := s;
  d := d + i;
  unsigned_out := u;
  r := i;
  wide := d;
  real_out := r + 0.5;
END_PROGRAM
