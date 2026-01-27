PROGRAM TestTON
VAR
    timer1 : TON;
    out1 : BOOL;
END_VAR

timer1(IN := TRUE, PT := T#200ms);
out1 := timer1.Q;
END_PROGRAM
