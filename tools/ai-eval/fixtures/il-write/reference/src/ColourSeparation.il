PROGRAM ColourSeparation
VAR_INPUT
    Start     AT %I0.0 : BOOL;
    Waiting   AT %I0.1 : BOOL;
    IsRed     AT %I0.2 : BOOL;
    Extended  AT %I0.3 : BOOL;
    Retracted AT %I0.4 : BOOL;
END_VAR
VAR_OUTPUT
    RunIn     AT %Q0.0 : BOOL;
    RunOut    AT %Q0.1 : BOOL;
    RunSide   AT %Q0.2 : BOOL;
    Hold      AT %Q0.3 : BOOL;
    Push      AT %Q0.4 : BOOL;
    Busy      AT %Q0.5 : BOOL;
    Done      AT %Q0.6 : BOOL;
END_VAR
VAR
    Active  : BOOL;
    State   : INT;
    Handled : INT;
    Gate    : BOOL;
    Settle  : TON;
    Clear   : TON;
END_VAR

(* 0 wait for a workpiece, 1 push it out, 2 pull the plate back, 3 let a blue one go by *)
        LD    Start
        JMPCN started
        LD    TRUE
        ST    Active
started:

(* the workpiece must lie still against the blade before its colour is read; after the
   release it must have left the blade before the blade holds again *)
        LD    State
        EQ    0
        AND   Waiting
        ST    Gate
        CAL   Settle(IN := Gate, PT := T#300ms)
        LD    State
        EQ    3
        ANDN  Waiting
        ST    Gate
        CAL   Clear(IN := Gate, PT := T#1500ms)

(* state 0: read the colour and choose the route *)
        LD    State
        EQ    0
        AND   Active
        AND   Settle.Q
        JMPCN not0
        LD    IsRed
        JMPCN blue
        LD    1
        ST    State
        JMP   not0
blue:
        LD    3
        ST    State
not0:

(* state 1: the plate is fully out *)
        LD    State
        EQ    1
        AND   Extended
        JMPCN not1
        LD    2
        ST    State
not1:

(* state 2: the plate is back, the workpiece is handled *)
        LD    State
        EQ    2
        AND   Retracted
        JMPCN not2
        LD    Handled
        ADD   1
        ST    Handled
        LD    0
        ST    State
not2:

(* state 3: the blue workpiece has left the blade *)
        LD    State
        EQ    3
        AND   Clear.Q
        JMPCN not3
        LD    Handled
        ADD   1
        ST    Handled
        LD    0
        ST    State
not3:

        LD    Active
        ST    RunIn
        ST    RunOut
        ST    RunSide
        LD    State
        NE    3
        AND   Active
        ST    Hold
        LD    State
        EQ    1
        ST    Push
        LD    Handled
        GE    8
        ST    Done
        LD    Active
        ANDN  Done
        ST    Busy
END_PROGRAM
