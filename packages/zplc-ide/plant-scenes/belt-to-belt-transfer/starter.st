PROGRAM BeltTransfer
VAR_INPUT
    Start    AT %I0.0 : BOOL;  (* StartButton.pressed: start the transfer *)
    Waiting  AT %I0.1 : BOOL;  (* EyePick.detect: a box waits at the stop blade of the infeed *)
    OutEye   AT %I0.2 : BOOL;  (* EyeOut.detect: a box passes on the outfeed belt *)
    XMin     AT %I0.3 : BOOL;  (* Pick1.xAtMin: the carriage is over the infeed *)
    XMax     AT %I0.4 : BOOL;  (* Pick1.xAtMax: the carriage is over the outfeed *)
    YMin     AT %I0.5 : BOOL;  (* Pick1.yAtMin: the clamp is down *)
    YMax     AT %I0.6 : BOOL;  (* Pick1.yAtMax: the clamp is up *)
    Gripped  AT %I0.7 : BOOL;  (* Pick1.gripped: the clamp holds a box *)
END_VAR
VAR_OUTPUT
    RunIn    AT %Q0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunOut   AT %Q0.1 : BOOL;  (* Outfeed.run: run the outfeed belt *)
    Emit     AT %Q0.2 : BOOL;  (* Source1.emit: put one box on the infeed belt *)
    Hold     AT %Q0.3 : BOOL;  (* Stop1.extend: the blade holds the box while true *)
    XPlus    AT %Q0.4 : BOOL;  (* Pick1.xPlus: move toward the outfeed while true *)
    XMinus   AT %Q0.5 : BOOL;  (* Pick1.xMinus: move toward the infeed while true *)
    YPlus    AT %Q0.6 : BOOL;  (* Pick1.yPlus: lift the clamp while true *)
    YMinus   AT %Q0.7 : BOOL;  (* Pick1.yMinus: lower the clamp while true *)
    Grip     AT %Q1.0 : BOOL;  (* Pick1.grip: close the clamp while true *)
    Busy     AT %Q1.1 : BOOL;  (* Beacon.amber: the transfer is running *)
    Done     AT %Q1.2 : BOOL;  (* Beacon.green: lit when four boxes have crossed the outfeed *)
END_VAR

(* Goal: a press of the start button runs the infeed and puts four boxes on
   it, one at a time. The blade stops each box where the clamp can reach it.
   For every box: lower the clamp, close it and wait for Gripped, lift, carry
   the box over the outfeed, lower, open the clamp and let the box settle,
   lift, and return. Keep the outfeed belt stopped while a box is put down on
   it and run it afterwards. Light Busy while the transfer runs and Done when
   four boxes have passed EyeOut. *)

END_PROGRAM
