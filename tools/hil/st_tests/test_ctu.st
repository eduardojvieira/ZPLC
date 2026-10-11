PROGRAM TestCTU
VAR
    count1 : CTU;
    clk : BOOL := TRUE;
    out_full AT %QX0.0 : BOOL;
    cv AT %QW1 : INT;
END_VAR

count1(CU := clk, PV := 5, R := FALSE);
out_full := count1.Q;
cv := count1.CV;

clk := NOT clk;
END_PROGRAM
