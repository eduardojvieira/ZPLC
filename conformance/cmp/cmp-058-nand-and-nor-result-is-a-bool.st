PROGRAM GateBits
VAR
  t : BOOL := TRUE;
  f : BOOL := FALSE;
  nand_true AT %QB0 : BYTE;
  nand_false AT %QB1 : BYTE;
  nor_true AT %QB2 : BYTE;
  nor_false AT %QB3 : BYTE;
END_VAR
  nand_true := BOOL_TO_USINT(NAND(f, t));
  nand_false := BOOL_TO_USINT(NAND(t, t));
  nor_true := BOOL_TO_USINT(NOR(f, f));
  nor_false := BOOL_TO_USINT(NOR(t, f));
END_PROGRAM
