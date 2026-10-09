PROGRAM Counter
VAR
  c : CTU;
  clk : BOOL;
  reached AT %QX0.0 : BOOL;
  value AT %QW1 : INT;
END_VAR
  clk := NOT clk;
  c(CU := clk, R := FALSE, PV := 3);
  reached := c.Q;
  value := c.CV;
END_PROGRAM
