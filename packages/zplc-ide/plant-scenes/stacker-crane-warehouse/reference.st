PROGRAM Warehouse
VAR_INPUT
    Start   AT %IX0.0 : BOOL;  (* StartButton.pressed: start the warehouse *)
    Req1    AT %IX0.1 : BOOL;  (* Req1.pressed: retrieve the box of cell 1 *)
    Req2    AT %IX0.2 : BOOL;  (* Req2.pressed: retrieve the box of cell 2 *)
    Req3    AT %IX0.3 : BOOL;  (* Req3.pressed: retrieve the box of cell 3 *)
    InEye   AT %IX0.4 : BOOL;  (* InEye.detect: a box waits at the end of the infeed belt *)
    InPos   AT %IX0.5 : BOOL;  (* Crane1.inPosition: both axes are at their setpoint *)
    Raised  AT %IX0.6 : BOOL;  (* Crane1.raised: the fork is raised *)
    Centre  AT %IX0.7 : BOOL;  (* Crane1.forkCentre: the fork is retracted *)
    AtLeft  AT %IX1.0 : BOOL;  (* Crane1.forkAtLeft: the fork is out towards the infeed *)
    AtRight AT %IX1.1 : BOOL;  (* Crane1.forkAtRight: the fork is out towards the rack and the outfeed *)
    Loaded  AT %IX1.2 : BOOL;  (* Crane1.loaded: a box rests on the fork *)
END_VAR
VAR_OUTPUT
    Bay       AT %QW1   : INT;   (* Crane1.bay: 0 is the dock, 1 to 3 are the columns *)
    Level     AT %QW2   : INT;   (* Crane1.level: 0 is the dock, 1 and 2 are the shelves *)
    Raise     AT %QX0.0 : BOOL;  (* Crane1.raise *)
    ForkLeft  AT %QX0.1 : BOOL;  (* Crane1.forkLeft *)
    ForkRight AT %QX0.2 : BOOL;  (* Crane1.forkRight *)
    BeltRight AT %QX0.3 : BOOL;  (* Crane1.beltRight *)
    RunIn     AT %QX0.4 : BOOL;  (* Infeed.run *)
    RunOut    AT %QX0.5 : BOOL;  (* Outfeed.run *)
    Green     AT %QX0.6 : BOOL;  (* StackLight1.green: every request is served *)
END_VAR
VAR
    CS    : INT := 0;    (* 0 wait for Start, 10 idle, 20 to 29 store, 40 to 52 retrieve *)
    CT    : INT := 0;    (* wait counter, scans *)
    Cell  : INT := 0;    (* the cell of the job: its column, on level 1 *)
    Done  : INT := 0;    (* retrievals finished *)
    O1    : BOOL := FALSE;  (* the table of occupied cells, kept by the program *)
    O2    : BOOL := FALSE;
    O3    : BOOL := FALSE;
    P1    : BOOL := FALSE;  (* the requests waiting in the queue *)
    P2    : BOOL := FALSE;
    P3    : BOOL := FALSE;
END_VAR

IF CT > 0 THEN CT := CT - 1; END_IF;
IF Req1 THEN P1 := TRUE; END_IF;
IF Req2 THEN P2 := TRUE; END_IF;
IF Req3 THEN P3 := TRUE; END_IF;

(* the setpoints latch on the step after they are written, so every move waits 0.3 s before it trusts inPosition;
   the fork is only extended once the crane is in position, and the crane only moves with the fork centred *)
CASE CS OF
    0: IF Start THEN CS := 10; END_IF;

    10: IF InEye AND NOT (O1 AND O2 AND O3) THEN
            IF NOT O1 THEN Cell := 1; ELSIF NOT O2 THEN Cell := 2; ELSE Cell := 3; END_IF;
            RunIn := FALSE; Raise := TRUE; ForkLeft := TRUE; CS := 20;
        ELSIF P1 AND O1 THEN Cell := 1; Bay := 1; Level := 1; CT := 30; CS := 40;
        ELSIF P2 AND O2 THEN Cell := 2; Bay := 2; Level := 1; CT := 30; CS := 40;
        ELSIF P3 AND O3 THEN Cell := 3; Bay := 3; Level := 1; CT := 30; CS := 40;
        END_IF;

    (* store: take the box from the infeed, carry it to the cell, put it down on the rails *)
    20: IF Raised AND AtLeft THEN BeltRight := TRUE; RunIn := TRUE; CS := 21; END_IF;
    21: IF Loaded THEN BeltRight := FALSE; RunIn := FALSE; CT := 20; CS := 22; END_IF;
    22: IF CT = 0 THEN ForkLeft := FALSE; CS := 23; END_IF;
    23: IF Centre THEN Bay := Cell; Level := 1; CT := 30; CS := 24; END_IF;
    24: IF CT = 0 AND InPos THEN ForkRight := TRUE; CS := 25; END_IF;
    25: IF AtRight THEN Raise := FALSE; CS := 26; END_IF;
    26: IF NOT Raised THEN CT := 30; CS := 27; END_IF;
    27: IF CT = 0 THEN ForkRight := FALSE; CS := 28; END_IF;
    28: IF Centre THEN
            IF Cell = 1 THEN O1 := TRUE; ELSIF Cell = 2 THEN O2 := TRUE; ELSE O3 := TRUE; END_IF;
            Bay := 0; Level := 0; CT := 30; CS := 29;
        END_IF;
    29: IF CT = 0 AND InPos THEN CS := 10; END_IF;

    (* retrieve: take the box out of the cell, bring it to the dock and put it on the outfeed *)
    40: IF CT = 0 AND InPos THEN ForkRight := TRUE; CS := 41; END_IF;
    41: IF AtRight THEN Raise := TRUE; CS := 42; END_IF;
    42: IF Raised THEN CT := 30; CS := 43; END_IF;
    43: IF CT = 0 THEN ForkRight := FALSE; CS := 44; END_IF;
    44: IF Centre THEN Bay := 0; Level := 0; CT := 30; CS := 45; END_IF;
    45: IF CT = 0 AND InPos THEN ForkRight := TRUE; CS := 46; END_IF;
    46: IF AtRight THEN BeltRight := TRUE; CS := 47; END_IF;
    47: IF NOT Loaded THEN CT := 80; CS := 48; END_IF;
    48: IF CT = 0 THEN BeltRight := FALSE; ForkRight := FALSE; CS := 49; END_IF;
    49: IF Centre THEN
            Raise := FALSE;
            IF Cell = 1 THEN O1 := FALSE; P1 := FALSE; ELSIF Cell = 2 THEN O2 := FALSE; P2 := FALSE; ELSE O3 := FALSE; P3 := FALSE; END_IF;
            Done := Done + 1; CT := 50; CS := 50;
        END_IF;
    50: IF CT = 0 THEN CS := 10; END_IF;
    ELSE ;
END_CASE;

(* the infeed belt feeds the crane's dock: it runs while no box waits at the eye, and the outfeed always runs *)
IF CS >= 10 AND CS < 20 THEN RunIn := NOT InEye; END_IF;
IF CS = 29 THEN RunIn := NOT InEye; END_IF;
RunOut := CS >= 10;
Green := Done >= 2;

END_PROGRAM
