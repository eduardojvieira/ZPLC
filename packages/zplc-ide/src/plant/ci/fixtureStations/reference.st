PROGRAM StationCycle
VAR_INPUT
    Start   AT %IX0.0 : BOOL;   (* Start1.pressed *)
    InPos   AT %IX0.1 : BOOL;   (* Crane1.inPosition *)
    Raised  AT %IX0.2 : BOOL;   (* Crane1.raised *)
    Centre  AT %IX0.3 : BOOL;   (* Crane1.forkCentre *)
    AtRight AT %IX0.4 : BOOL;   (* Crane1.forkAtRight *)
    AtL1    AT %IX0.5 : BOOL;   (* Lift1.atLevel1 *)
    AtL2    AT %IX0.6 : BOOL;   (* Lift1.atLevel2 *)
    Ready   AT %IX0.7 : BOOL;   (* Mc1.ready *)
END_VAR
VAR_OUTPUT
    Bay       AT %QW1   : INT;    (* Crane1.bay: 0 to 2 *)
    Level     AT %QW2   : INT;    (* Crane1.level: 0 to 2 *)
    Raise     AT %QX0.0 : BOOL;   (* Crane1.raise *)
    ForkRight AT %QX0.1 : BOOL;   (* Crane1.forkRight *)
    LiftUp    AT %QX0.2 : BOOL;   (* Lift1.up *)
    LiftDown  AT %QX0.3 : BOOL;   (* Lift1.down *)
    CrateEmit AT %QX0.4 : BOOL;   (* Crate1.emit *)
    FeedRun   AT %QX0.5 : BOOL;   (* Feed1.run *)
    McFeed    AT %QX0.6 : BOOL;   (* Mc1.feed *)
    McStart   AT %QX0.7 : BOOL;   (* Mc1.start *)
END_VAR
VAR
    CS : INT := 0;   (* crane: store the box on the fork in cell (1, 1), come back to the dock, retrieve it *)
    CT : INT := 0;
    LS : INT := 0;   (* lift: a crate rides up to level 2 and down again *)
    LT : INT := 0;
    MS : INT := 0;   (* machining centre: feed the blank, stop the belt, start the cycle *)
    MT : INT := 0;
END_VAR

IF CT > 0 THEN CT := CT - 1; END_IF;
IF LT > 0 THEN LT := LT - 1; END_IF;
IF MT > 0 THEN MT := MT - 1; END_IF;

(* the setpoints latch on the step after they are written, so every move waits 0.3 s before it trusts inPosition *)
CASE CS OF
    0: IF Start THEN CS := 1; END_IF;
    1: Raise := TRUE; Level := 1; Bay := 1; CT := 30; CS := 2;
    2: IF CT = 0 AND InPos AND Raised THEN CS := 3; END_IF;
    3: ForkRight := TRUE; IF AtRight THEN Raise := FALSE; CT := 150; CS := 4; END_IF;
    4: IF CT = 0 THEN ForkRight := FALSE; CS := 5; END_IF;
    5: IF Centre THEN CT := 50; CS := 6; END_IF;
    6: IF CT = 0 THEN Level := 0; Bay := 0; CT := 30; CS := 7; END_IF;
    7: IF CT = 0 AND InPos THEN CT := 100; CS := 8; END_IF;
    8: IF CT = 0 THEN Level := 1; Bay := 1; CT := 30; CS := 9; END_IF;
    9: IF CT = 0 AND InPos THEN ForkRight := TRUE; CS := 10; END_IF;
    10: IF AtRight THEN CT := 50; CS := 11; END_IF;
    11: IF CT = 0 THEN Raise := TRUE; CS := 12; END_IF;
    12: IF Raised THEN CT := 50; CS := 13; END_IF;
    13: IF CT = 0 THEN ForkRight := FALSE; CS := 14; END_IF;
    14: IF Centre THEN CT := 50; CS := 15; END_IF;
    ELSE ;
END_CASE;

CASE LS OF
    0: IF Start THEN CrateEmit := TRUE; LT := 20; LS := 1; END_IF;
    1: IF LT = 0 THEN CrateEmit := FALSE; LT := 100; LS := 2; END_IF;
    2: IF LT = 0 THEN LiftUp := TRUE; LS := 3; END_IF;
    3: IF AtL2 THEN LiftUp := FALSE; LT := 100; LS := 4; END_IF;
    4: IF LT = 0 THEN LiftDown := TRUE; LS := 5; END_IF;
    5: IF AtL1 THEN LiftDown := FALSE; LS := 6; END_IF;
    ELSE ;
END_CASE;

CASE MS OF
    0: IF Start THEN FeedRun := TRUE; McFeed := TRUE; MT := 320; MS := 1; END_IF;
    1: IF MT = 0 THEN FeedRun := FALSE; McFeed := FALSE; MT := 80; MS := 2; END_IF;
    2: IF MT = 0 AND Ready THEN McStart := TRUE; MT := 20; MS := 3; END_IF;
    3: IF MT = 0 THEN McStart := FALSE; MS := 4; END_IF;
    ELSE ;
END_CASE;

END_PROGRAM
