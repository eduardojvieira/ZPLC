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
VAR
    Active  : BOOL;
    State   : INT;
    Handled : INT;
    Gate    : BOOL;
    Settle  : TON;
    Clear   : TON;
END_VAR

(* Goal: the same sorting as in Structured Text. A press of the start button runs the three
   belts. Eight workpieces, red or blue, arrive one at a time. The blade stops each one in
   front of the colour sensor; once it has lain still for 300 ms, read IsRed. A red one is
   pushed onto the side belt: extend the pusher until Extended, then retract it until
   Retracted. A blue one is released and rides on. Keep the step in State (0 wait, 1 push,
   2 retract, 3 release) and test it with LD State, EQ n, then JMPCN to skip a block. CAL
   takes variables, so store a condition in Gate before CAL Settle or CAL Clear. Light Busy
   while the line runs and Done after the eighth workpiece. *)

        LD    Start
        JMPCN started
        LD    TRUE
        ST    Active
started:
        LD    Active
        ST    RunIn
END_PROGRAM
