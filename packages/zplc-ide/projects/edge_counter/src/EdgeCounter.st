PROGRAM EdgeCounter

VAR_INPUT
    PulseInput AT %I0.0 : BOOL;
    Reset AT %I0.1 : BOOL;
END_VAR

VAR
    Edge : R_TRIG;
    Count : CTU;
END_VAR

VAR_OUTPUT
    CountReached AT %Q0.0 : BOOL;
END_VAR

Edge(CLK := PulseInput);
Count(CU := Edge.Q, R := Reset, PV := 3);
CountReached := Count.Q;

END_PROGRAM
