PROGRAM TestCTU
VAR
    count1 : CTU;
    clk : BOOL := TRUE;
    out_full : BOOL;
END_VAR

count1(CU := clk, PV := 5, R := FALSE);
out_full := count1.Q;

clk := NOT clk;
END_PROGRAM
