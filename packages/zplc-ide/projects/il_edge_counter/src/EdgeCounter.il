PROGRAM EdgeCounter
VAR_INPUT
    PulseInput AT %I0.0 : BOOL;
    Reset AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    CountReached AT %Q0.0 : BOOL;
END_VAR
VAR
    Count : CTU;
END_VAR

        CAL   Count(CU := PulseInput, R := Reset, PV := 3)
        LD    Count.Q
        ST    CountReached
END_PROGRAM
