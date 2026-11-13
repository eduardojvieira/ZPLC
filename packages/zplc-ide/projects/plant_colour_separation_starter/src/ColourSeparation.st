PROGRAM ColourSeparation
VAR_INPUT
    Start     AT %I0.0 : BOOL;  (* StartButton.pressed: start the line *)
    Waiting   AT %I0.1 : BOOL;  (* EyeStop.detect: a workpiece waits at the stop blade *)
    IsRed     AT %I0.2 : BOOL;  (* Colour1.match: the workpiece in the beam is red *)
    Extended  AT %I0.3 : BOOL;  (* Pusher1.extended: the plate is fully out *)
    Retracted AT %I0.4 : BOOL;  (* Pusher1.retracted: the plate is fully back *)
END_VAR
VAR_OUTPUT
    RunIn     AT %Q0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunOut    AT %Q0.1 : BOOL;  (* Outfeed.run: run the belt that ends in BlueBin *)
    RunSide   AT %Q0.2 : BOOL;  (* SideBelt.run: run the belt that ends in RedBin *)
    Hold      AT %Q0.3 : BOOL;  (* Stop1.extend: the blade holds a workpiece while true *)
    Push      AT %Q0.4 : BOOL;  (* Pusher1.extend: push sideways while true, retract when false *)
    Busy      AT %Q0.5 : BOOL;  (* Beacon.amber: the line is running *)
    Done      AT %Q0.6 : BOOL;  (* Beacon.green: lit when eight workpieces are sorted *)
END_VAR

(* Goal: a press of the start button runs the three belts. Eight workpieces,
   red or blue, arrive one at a time on the infeed. The blade stops each one
   in front of the colour sensor. Wait until it lies still, then read IsRed.
   A red one is pushed onto the side belt: extend the pusher until Extended,
   then retract it and wait for Retracted. A blue one is released by the blade
   and rides on to the outfeed. Hold the blade again once the workpiece has
   gone. Light Busy while the line runs and Done after the eighth workpiece. *)

END_PROGRAM
