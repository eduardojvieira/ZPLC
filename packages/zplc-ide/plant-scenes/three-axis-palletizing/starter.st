PROGRAM Palletizing
VAR_INPUT
    XPos    AT %IW0 : INT;    (* Gantry1.xPos: 0 to 1000 is 0 to 1.6 m *)
    YPos    AT %IW1 : INT;    (* Gantry1.yPos: 0 to 1000 is 0 to 1.2 m *)
    ZPos    AT %IW2 : INT;    (* Gantry1.zPos: 0 to 1000 is 0 to 1.2 m *)
    Start   AT %I6.0 : BOOL;  (* StartButton.pressed *)
    Gripped AT %I6.1 : BOOL;  (* Gantry1.gripped: the vacuum pad holds a box *)
    EyePick AT %I6.2 : BOOL;  (* EyePick.detect: a box waits at the blade *)
END_VAR
VAR_OUTPUT
    XCmd    AT %QW0 : INT;    (* Gantry1.xSet: same scale as XPos *)
    YCmd    AT %QW1 : INT;    (* Gantry1.ySet *)
    ZCmd    AT %QW2 : INT;    (* Gantry1.zSet *)
    Grip    AT %Q6.0 : BOOL;  (* Gantry1.grip: vacuum on *)
    RunBelt AT %Q6.1 : BOOL;  (* Belt1.run *)
    Emit    AT %Q6.2 : BOOL;  (* Emitter1.emit: one box per rising edge *)
    Hold    AT %Q6.3 : BOOL;  (* Blade1.extend: stops the box at the pick spot *)
    Green   AT %Q6.4 : BOOL;  (* StackLight1.green: the pallet is full *)
    Amber   AT %Q6.5 : BOOL;  (* StackLight1.amber: palletizing *)
END_VAR


(* Goal: a press of Start palletizes eight boxes, two layers of four, on the
   pallet. The gantry starts on the floor: raise it before it moves across the
   belt. Send one box, wait until EyePick has seen it rest at the blade for
   0.6 s, lower the pad onto the box (Y 0.60 m), switch the vacuum on and wait
   for Gripped, lift, travel in X and Z to the next place of a 2 by 2 pattern,
   lower onto the pallet (0.144 m) or onto the first layer (0.444 m), switch
   the vacuum off, lift and return. Compare each position with its command in
   raw counts (a difference of one count is 1.6 mm in X, 1.2 mm in Y and Z).
   Send the next box only when the pad is clear of the belt. When the eighth
   box is down, Green on and Amber off. *)

END_PROGRAM
