PROGRAM HeightSortChain
VAR_INPUT
    Start       AT %I0.0 : BOOL;
    Low         AT %I0.1 : BOOL;
    High        AT %I0.2 : BOOL;
    AtBlade     AT %I0.3 : BOOL;
    Raised      AT %I0.4 : BOOL;
    Lowered     AT %I0.5 : BOOL;
END_VAR
VAR_OUTPUT
    RunIn       AT %Q0.0 : BOOL;
    RunChain    AT %Q0.1 : BOOL;
    Lift        AT %Q0.2 : BOOL;
    MoveRight   AT %Q0.3 : BOOL;
    MoveLeft    AT %Q0.4 : BOOL;
    RunStraight AT %Q0.5 : BOOL;
    RunRight    AT %Q0.6 : BOOL;
    RunLeft     AT %Q0.7 : BOOL;
    Hold        AT %Q1.0 : BOOL;
    Busy        AT %Q1.1 : BOOL;
    Done        AT %Q1.2 : BOOL;
END_VAR
VAR
    Active   : BOOL;
    State    : INT;
    Dir      : INT;
    Handled  : INT;
    SawLow   : BOOL;
    SawHigh  : BOOL;
    Stand    : TON;
    Clear    : TON;
    Lifted   : TON;
    Slide    : TON;
    Stuck    : TON;
    Fault    : BOOL;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* the two beams sit across the infeed: 0.25 m (a 0.30 m or 0.40 m box breaks it) and 0.35 m (only
   a 0.40 m box breaks it). A 0.20 m box breaks neither. The latch keeps what the box showed. *)
IF Low THEN
    SawLow := TRUE;
END_IF;
IF High THEN
    SawHigh := TRUE;
END_IF;

(* the box must stand still against the blade before anything moves; the module needs a moment at the
   top before it slides a box (its surface stops first); the timers below are measured for 0.5 m/s *)
(* a box breaks the upper beam for about a second; a beam that stays on for three is stuck *)
Stuck(IN := High, PT := T#3000ms);
IF Stuck.Q THEN
    Fault := TRUE;
END_IF;

Stand(IN := AtBlade AND State = 1 AND NOT Fault, PT := T#1000ms);
Clear(IN := State = 2, PT := T#2200ms);
Lifted(IN := State = 3 AND Raised, PT := T#300ms);
Slide(IN := State = 4, PT := T#1600ms);

(* 0 idle, 1 wait for a box at the blade, 2 straight on (short), 3 lift, 4 slide sideways, 5 lower.
   Dir: 0 short (straight), 1 medium (right), 2 tall (left) *)
CASE State OF
    0:
        IF Active THEN
            State := 1;
        END_IF;
    1:
        IF Stand.Q THEN
            IF SawHigh THEN
                Dir := 2;
            ELSIF SawLow THEN
                Dir := 1;
            ELSE
                Dir := 0;
            END_IF;
            (* the next box passes the beams before this one is done: clear the latch now *)
            SawLow := FALSE;
            SawHigh := FALSE;
            IF Dir = 0 THEN
                State := 2;
            ELSE
                State := 3;
            END_IF;
        END_IF;
    2:
        IF Clear.Q THEN
            Handled := Handled + 1;
            State := 1;
        END_IF;
    3:
        IF Lifted.Q THEN
            State := 4;
        END_IF;
    4:
        IF Slide.Q THEN
            State := 5;
        END_IF;
    5:
        IF Lowered THEN
            Handled := Handled + 1;
            State := 1;
        END_IF;
END_CASE;

RunIn       := Active AND NOT Fault;
RunStraight := Active;
RunRight    := Active;
RunLeft     := Active;
(* the module carries a box straight on while it is down; with lift it must not run (a conflict) *)
RunChain    := Active AND NOT Fault AND (State = 1 OR State = 2);
Hold        := Active AND State <> 2;
Lift        := State = 3 OR State = 4;
MoveRight   := State = 4 AND Dir = 1;
MoveLeft    := State = 4 AND Dir = 2;
Busy        := Active AND Handled < 9 AND NOT Fault;
Done        := Handled >= 9;

END_PROGRAM
