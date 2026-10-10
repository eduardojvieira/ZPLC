PROGRAM Small
VAR
  a : UDINT := 1000000;
  quotient AT %QD0 : UDINT;
  remainder AT %QD4 : UDINT;
END_VAR
  quotient := a / 7;
  remainder := a MOD 7;
END_PROGRAM
