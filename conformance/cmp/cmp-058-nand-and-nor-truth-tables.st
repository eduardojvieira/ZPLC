PROGRAM Gates
VAR
  t : BOOL := TRUE;
  f : BOOL := FALSE;
  nand00 AT %QX0.0 : BOOL;
  nand01 AT %QX0.1 : BOOL;
  nand10 AT %QX0.2 : BOOL;
  nand11 AT %QX0.3 : BOOL;
  nor00 AT %QX0.4 : BOOL;
  nor01 AT %QX0.5 : BOOL;
  nor10 AT %QX0.6 : BOOL;
  nor11 AT %QX0.7 : BOOL;
END_VAR
  IF NAND(f, f) THEN nand00 := TRUE; ELSE nand00 := FALSE; END_IF;
  IF NAND(f, t) THEN nand01 := TRUE; ELSE nand01 := FALSE; END_IF;
  IF NAND(t, f) THEN nand10 := TRUE; ELSE nand10 := FALSE; END_IF;
  IF NAND(t, t) THEN nand11 := TRUE; ELSE nand11 := FALSE; END_IF;
  IF NOR(f, f) THEN nor00 := TRUE; ELSE nor00 := FALSE; END_IF;
  IF NOR(f, t) THEN nor01 := TRUE; ELSE nor01 := FALSE; END_IF;
  IF NOR(t, f) THEN nor10 := TRUE; ELSE nor10 := FALSE; END_IF;
  IF NOR(t, t) THEN nor11 := TRUE; ELSE nor11 := FALSE; END_IF;
END_PROGRAM
