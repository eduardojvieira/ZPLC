PROGRAM MergeLines
VAR_INPUT
    Start AT %I0.0 : BOOL;
    WaitA AT %I0.1 : BOOL;
    WaitB AT %I0.2 : BOOL;
    Zone  AT %I0.3 : BOOL;
END_VAR
VAR_OUTPUT
    RunA  AT %Q0.0 : BOOL;
    RunB  AT %Q0.1 : BOOL;
    RunOut AT %Q0.2 : BOOL;
    EmitA AT %Q0.3 : BOOL;
    EmitB AT %Q0.4 : BOOL;
    HoldA AT %Q0.5 : BOOL;
    HoldB AT %Q0.6 : BOOL;
    Done  AT %Q0.7 : BOOL;
END_VAR
VAR
    Active : BOOL;
    GrantA : BOOL;
    GrantB : BOOL;
    Seen   : BOOL;
    GoneA  : F_TRIG;
    GoneB  : F_TRIG;
    ZoneGone : F_TRIG;
    LoadedA : CTU;
    LoadedB : CTU;
    Merged  : CTU;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* each feeder is loaded with three boxes, the next one once the previous has left the blade *)
GoneA(CLK := WaitA);
GoneB(CLK := WaitB);
EmitA := (Start OR GoneA.Q) AND Active AND NOT LoadedA.Q;
EmitB := (Start OR GoneB.Q) AND Active AND NOT LoadedB.Q;
LoadedA(CU := GoneA.Q, R := FALSE, PV := 3);
LoadedB(CU := GoneB.Q, R := FALSE, PV := 3);

(* arbitration: one grant at a time, line A first; a grant ends when its box has left the merge zone *)
ZoneGone(CLK := Zone);
IF Active AND NOT GrantA AND NOT GrantB AND NOT Zone THEN
    IF WaitA THEN
        GrantA := TRUE;
    ELSIF WaitB THEN
        GrantB := TRUE;
    END_IF;
END_IF;
IF (GrantA OR GrantB) AND Zone THEN
    Seen := TRUE;
END_IF;
IF Seen AND ZoneGone.Q THEN
    GrantA := FALSE;
    GrantB := FALSE;
    Seen := FALSE;
END_IF;
Merged(CU := ZoneGone.Q, R := FALSE, PV := 6);

RunA := Active;
RunB := Active;
RunOut := Active;
HoldA := Active AND NOT GrantA;
HoldB := Active AND NOT GrantB;
Done := Merged.Q;

END_PROGRAM
