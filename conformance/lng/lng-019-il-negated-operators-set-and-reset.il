PROGRAM Negated
VAR
  A AT %IX0.0 : BOOL;
  B AT %IX0.1 : BOOL;
  X AT %QX0.0 : BOOL;
  Y AT %QX0.1 : BOOL;
  Latch AT %QX0.2 : BOOL;
END_VAR
  LDN A
  ANDN B
  ST X
  STN Y
  LD A
  S Latch
  LD B
  R Latch
END_PROGRAM
