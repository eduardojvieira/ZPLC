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

(* Goal: after Start, run the three belts and hold each box on the scale with
   the blade. When the scale is stable, compare Weight with 3.5 kg: a heavier
   box is pushed onto the side belt (extend the pusher until Extended, then
   retract it until Retracted) and ends in the heavy bin; a lighter box is
   released by lowering the blade for 2.5 s and ends in the light bin. Stop
   the infeed while a box is pushed, and light Green after twelve boxes. *)

END_PROGRAM
