PROGRAM MergeLines
VAR_INPUT
    Start  AT %I0.0 : BOOL;  (* StartButton.pressed: start the line *)
    WaitA  AT %I0.1 : BOOL;  (* EyeA.detect: a box waits at the blade of feeder A *)
    WaitB  AT %I0.2 : BOOL;  (* EyeB.detect: a box waits at the blade of feeder B *)
    Zone   AT %I0.3 : BOOL;  (* EyeZone.detect: a box is on the outfeed past the merge *)
END_VAR
VAR_OUTPUT
    RunA   AT %Q0.0 : BOOL;  (* FeedA.run: run feeder A *)
    RunB   AT %Q0.1 : BOOL;  (* FeedB.run: run feeder B *)
    RunOut AT %Q0.2 : BOOL;  (* Outfeed.run: run the outfeed belt *)
    EmitA  AT %Q0.3 : BOOL;  (* EmitterA.emit: put one box on feeder A *)
    EmitB  AT %Q0.4 : BOOL;  (* EmitterB.emit: put one box on feeder B *)
    HoldA  AT %Q0.5 : BOOL;  (* BladeA.extend: the blade holds feeder A while true *)
    HoldB  AT %Q0.6 : BOOL;  (* BladeB.extend: the blade holds feeder B while true *)
    Done   AT %Q0.7 : BOOL;  (* DoneLight.lit: lit when all six boxes have left *)
END_VAR

(* Goal: a press of the start button loads three boxes on each feeder, one
   at a time, and each blade holds its feeder. Let one box at a time through
   to the outfeed: never open both blades together, and open the next one
   only when the previous box has left the merge, seen at Zone. Light Done
   when all six boxes have left. *)

END_PROGRAM
