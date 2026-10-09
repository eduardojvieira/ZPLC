PROGRAM CtuUpperLimit
VAR
  cuIn AT %IX0.0 : BOOL;
  rIn AT %IX0.1 : BOOL;
  c : CTU;
  q AT %QX0.0 : BOOL;
  cv AT %QW1 : INT;
  first : BOOL := TRUE;
END_VAR
  (* CV is written once to start next to the limit: reaching 32767 by counting takes 65534 scans *)
  IF first THEN
    c.CV := 32766;
    first := FALSE;
  END_IF;
  c(CU := cuIn, R := rIn, PV := 5);
  q := c.Q;
  cv := c.CV;
END_PROGRAM
