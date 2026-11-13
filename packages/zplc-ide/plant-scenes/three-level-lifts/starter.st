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

(* Goal: after Start, bring each box from level 1 to level 3 with two lifts.
   A box rides the infeed onto lift A and stops on it (BoxOnA). Lift A rises to
   level 2, runs the box off onto the transfer belt and lowers again; lift B
   does the same one level higher, from the transfer belt to the outfeed. A belt
   or a lift surface runs only while a lift stands at a level: never move a lift
   while its surface runs, and never run a belt towards a lift that is away.
   The emergency stop (EStopOk FALSE) stops everything and lights Red; after
   it is released, Start runs the line again. Light Green once five boxes have
   passed BoxAtTop. *)

END_PROGRAM
