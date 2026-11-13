PROGRAM TimedTank
VAR_INPUT
    Start     AT %I0.0 : BOOL;  (* StartButton.pressed: start the cycle *)
    EStopOk   AT %I0.1 : BOOL;  (* EStop1.ok: TRUE while the emergency stop is released *)
    LevelLow  AT %I0.2 : BOOL;  (* Tank1.levelLow: the level is at or below the low switch *)
    LevelHigh AT %I0.3 : BOOL;  (* Tank1.levelHigh: the level is at or above the high switch *)
END_VAR
VAR_OUTPUT
    Fill  AT %Q0.0 : BOOL;  (* Tank1.fill: open the fill valve *)
    Drain AT %Q0.1 : BOOL;  (* Tank1.drain: open the drain valve *)
    Green AT %Q0.2 : BOOL;  (* StackLight1.green: the cycle finished *)
    Amber AT %Q0.3 : BOOL;  (* StackLight1.amber: the cycle is running *)
    Red   AT %Q0.4 : BOOL;  (* StackLight1.red: emergency stop *)
END_VAR

VAR
    Step    : INT;  (* 0 idle, 1 fill, 2 hold, 3 drain *)
    Done    : BOOL;
    FillT   : TON;
    HoldT   : TON;
    DrainT  : TON;
END_VAR

(* an emergency stop aborts the cycle and keeps it idle *)
IF NOT EStopOk THEN
    Step := 0;
    Done := FALSE;
ELSIF Step = 0 AND Start THEN
    Step := 1;
    Done := FALSE;
END_IF;

(* fill for a fixed time: the tank has no sensor at this level, the timer is the lesson *)
FillT(IN := Step = 1, PT := T#3500ms);
IF Step = 1 AND FillT.Q THEN
    Step := 2;
END_IF;

HoldT(IN := Step = 2, PT := T#2s);
IF Step = 2 AND HoldT.Q THEN
    Step := 3;
END_IF;

(* drain until the low switch, with the timer as a safety limit *)
DrainT(IN := Step = 3, PT := T#20s);
IF Step = 3 AND (LevelLow OR DrainT.Q) THEN
    Step := 0;
    Done := TRUE;
END_IF;

Fill  := Step = 1;
Drain := Step = 3;
Amber := Step <> 0;
Green := Done;
Red   := NOT EStopOk;

END_PROGRAM
