PROGRAM Narrowing
VAR
  d : LREAL := 0.1;
  big : LREAL := 1.0E300;
  r AT %QD0 : REAL;
  s AT %QD1 : REAL;
END_VAR
  r := d;
  s := d * 2.0;
END_PROGRAM
