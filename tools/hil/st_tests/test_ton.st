PROGRAM TestTON
VAR
    timer1 : TON;
    out1 AT %QX0.0 : BOOL;
    et AT %QD1 : TIME;
END_VAR

timer1(IN := TRUE, PT := T#200ms);
out1 := timer1.Q;
et := timer1.ET;
END_PROGRAM
