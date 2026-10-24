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

(* Exercise: call PumpB like PumpA, with its own Start and Stop, and copy its Q to RunB. *)
        CAL   PumpA(Set := StartA, Reset := StopA)
        LD    PumpA.Q
        ST    RunA
END_PROGRAM
