PROGRAM PumpPair
VAR_INPUT
    StartA AT %I0.0 : BOOL;
    StopA AT %I0.1 : BOOL;
    StartB AT %I0.2 : BOOL;
    StopB AT %I0.3 : BOOL;
END_VAR
VAR_OUTPUT
    RunA AT %Q0.0 : BOOL;
    RunB AT %Q0.1 : BOOL;
END_VAR
VAR
    PumpA : Latch;
    PumpB : Latch;
END_VAR

        CAL   PumpA(Set := StartA, Reset := StopA)
        LD    PumpA.Q
        ST    RunA
        CAL   PumpB(Set := StartB, Reset := StopB)
        LD    PumpB.Q
        ST    RunB
END_PROGRAM
