PROGRAM ThreeLevelLifts
VAR_INPUT
    Start     AT %IX0.0 : BOOL;  (* StartButton.pressed: start the line *)
    EStopOk   AT %IX0.1 : BOOL;  (* EStop1.ok: TRUE while the emergency stop is released *)
    BoxOnA    AT %IX0.2 : BOOL;  (* EyeFoot.detect: a box has reached the middle of lift A at level 1 *)
    BoxOnB    AT %IX0.3 : BOOL;  (* EyeMid.detect: a box has reached the middle of lift B at its bottom level *)
    BoxAtTop  AT %IX0.4 : BOOL;  (* EyeTop.detect: a box is on the outfeed belt at level 3 *)
    AAtLow    AT %IX0.5 : BOOL;  (* LiftA.atLevel1: lift A rests at level 1 *)
    AAtHigh   AT %IX0.6 : BOOL;  (* LiftA.atLevel2: lift A rests at level 2 *)
    BAtLow    AT %IX0.7 : BOOL;  (* LiftB.atLevel1: lift B rests at its bottom level (level 2 of the plant) *)
    BAtHigh   AT %IX1.0 : BOOL;  (* LiftB.atLevel2: lift B rests at its top level (level 3 of the plant) *)
END_VAR
VAR_OUTPUT
    RunInfeed   AT %QX0.0 : BOOL;  (* Infeed.run: run the belt that feeds lift A *)
    RunTransfer AT %QX0.1 : BOOL;  (* Transfer.run: run the belt between the lifts, level 2 *)
    RunOutfeed  AT %QX0.2 : BOOL;  (* Outfeed.run: run the belt to the bin, level 3 *)
    AUp         AT %QX0.3 : BOOL;  (* LiftA.up: raise lift A *)
    ADown       AT %QX0.4 : BOOL;  (* LiftA.down: lower lift A *)
    ARun        AT %QX0.5 : BOOL;  (* LiftA.run: run the surface of lift A *)
    BUp         AT %QX0.6 : BOOL;  (* LiftB.up: raise lift B *)
    BDown       AT %QX0.7 : BOOL;  (* LiftB.down: lower lift B *)
    BRun        AT %QX1.0 : BOOL;  (* LiftB.run: run the surface of lift B *)
    Green       AT %QX1.1 : BOOL;  (* StackLight1.green: all five boxes reached the top *)
    Red         AT %QX1.2 : BOOL;  (* StackLight1.red: the line is stopped *)
END_VAR

VAR
    Active   : BOOL;
    Stopped  : BOOL;
    StepA    : INT;   (* 0 load at level 1, 1 settle, 2 rise, 3 unload at level 2, 4 lower *)
    StepB    : INT;   (* the same sequence for lift B, one level higher *)
    SettleA  : TON;
    UnloadA  : TON;
    SettleB  : TON;
    UnloadB  : TON;
    Boxes    : CTU;
END_VAR

(* the emergency stop wins over Start; Start runs the line again once it is released *)
IF NOT EStopOk THEN
    Stopped := TRUE;
    Active := FALSE;
ELSIF Start THEN
    Stopped := FALSE;
    Active := TRUE;
END_IF;

SettleA(IN := Active AND StepA = 1, PT := T#500ms);
UnloadA(IN := Active AND StepA = 3, PT := T#2500ms);
SettleB(IN := Active AND StepB = 1, PT := T#500ms);
UnloadB(IN := Active AND StepB = 3, PT := T#2500ms);

IF Active THEN
    IF StepA = 0 THEN
        IF AAtLow AND BoxOnA THEN
            StepA := 1;
        END_IF;
    ELSIF StepA = 1 THEN
        IF SettleA.Q THEN
            StepA := 2;
        END_IF;
    ELSIF StepA = 2 THEN
        IF AAtHigh THEN
            StepA := 3;
        END_IF;
    ELSIF StepA = 3 THEN
        IF UnloadA.Q THEN
            StepA := 4;
        END_IF;
    ELSIF StepA = 4 THEN
        IF AAtLow THEN
            StepA := 0;
        END_IF;
    END_IF;

    IF StepB = 0 THEN
        IF BAtLow AND BoxOnB THEN
            StepB := 1;
        END_IF;
    ELSIF StepB = 1 THEN
        IF SettleB.Q THEN
            StepB := 2;
        END_IF;
    ELSIF StepB = 2 THEN
        IF BAtHigh THEN
            StepB := 3;
        END_IF;
    ELSIF StepB = 3 THEN
        IF UnloadB.Q THEN
            StepB := 4;
        END_IF;
    ELSIF StepB = 4 THEN
        IF BAtLow THEN
            StepB := 0;
        END_IF;
    END_IF;
END_IF;

Boxes(CU := BoxAtTop, R := FALSE, PV := 5);

(* the interlocks: a surface runs only while its lift stands at the level of its step; a lift moves only with its surface stopped *)
ARun := Active AND ((StepA = 0 AND AAtLow AND NOT BoxOnA) OR (StepA = 3 AND AAtHigh));
BRun := Active AND ((StepB = 0 AND BAtLow AND NOT BoxOnB) OR (StepB = 3 AND BAtHigh));
AUp := Active AND StepA = 2;
ADown := Active AND StepA = 4;
BUp := Active AND StepB = 2;
BDown := Active AND StepB = 4;

(* a belt towards a lift runs only while that lift waits at its loading level, so no box is ever pushed into a gap *)
RunInfeed := Active AND StepA = 0 AND AAtLow AND NOT BoxOnA;
RunTransfer := Active AND (StepA = 3 OR (StepB = 0 AND BAtLow AND NOT BoxOnB));
RunOutfeed := Active;
Green := Boxes.Q;
Red := Stopped;

END_PROGRAM
