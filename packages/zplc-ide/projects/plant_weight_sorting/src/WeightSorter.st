PROGRAM WeightSorter
VAR_INPUT
    Start     AT %IX0.0 : BOOL;  (* StartButton.pressed: start the line *)
    Stable    AT %IX0.1 : BOOL;  (* Scale1.stable: a box has rested on the scale long enough to be weighed *)
    Extended  AT %IX0.2 : BOOL;  (* Pusher1.extended: the pusher is at the end of its stroke *)
    Retracted AT %IX0.3 : BOOL;  (* Pusher1.retracted: the pusher is back at rest *)
    Weight    AT %ID1   : REAL;  (* Scale1.weight: the weight in kg, 0 while a box moves *)
END_VAR
VAR_OUTPUT
    RunInfeed  AT %QX0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunOutfeed AT %QX0.1 : BOOL;  (* Outfeed.run: run the belt to the light bin *)
    RunSide    AT %QX0.2 : BOOL;  (* SideBelt.run: run the belt to the heavy bin *)
    Hold       AT %QX0.3 : BOOL;  (* Blade1.extend: the blade holds the box on the scale while true *)
    Push       AT %QX0.4 : BOOL;  (* Pusher1.extend: push the box off the infeed onto the side belt *)
    Green      AT %QX0.5 : BOOL;  (* StackLight1.green: all twelve boxes are sorted *)
END_VAR

VAR
    Active   : BOOL;
    Step     : INT;   (* 0 wait for a stable box, 1 push it out, 2 pull the pusher back, 3 release it to the light bin *)
    Heavy    : BOOL;  (* the box on the scale is heavier than the limit *)
    Finished : BOOL;  (* one scan: a box has been dealt with *)
    Releasing : TON;
    Boxes    : CTU;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

Finished := FALSE;
Releasing(IN := Step = 3, PT := T#2500ms);

(* the limit is 3.5 kg: the two box masses, 2 and 5 kg, sit 1.5 kg either side of it *)
IF Step = 0 THEN
    IF Active AND Stable THEN
        Heavy := Weight > 3.5;
        IF Heavy THEN
            Step := 1;
        ELSE
            Step := 3;
        END_IF;
    END_IF;
ELSIF Step = 1 THEN
    IF Extended THEN
        Step := 2;
    END_IF;
ELSIF Step = 2 THEN
    IF Retracted THEN
        Finished := TRUE;
        Step := 0;
    END_IF;
ELSIF Step = 3 THEN
    (* the blade stays down long enough for the box to leave the scale and clear the blade *)
    IF Releasing.Q THEN
        Finished := TRUE;
        Step := 0;
    END_IF;
END_IF;

Boxes(CU := Finished, R := FALSE, PV := 12);

(* the infeed stops while the pusher works, so the belt never drags the box along the stroke *)
RunInfeed := Active AND Step <> 1 AND Step <> 2;
RunOutfeed := Active;
RunSide := Active;
Hold := Active AND Step <> 3;
Push := Step = 1;
Green := Boxes.Q;

END_PROGRAM
