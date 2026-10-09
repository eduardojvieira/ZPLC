PROGRAM MinMod
VAR
  a : DINT := -2147483647;
  m : DINT := -1;
  q AT %QD0 : DINT := 5;
END_VAR
  a := a - 1;
  q := a MOD m;
END_PROGRAM
