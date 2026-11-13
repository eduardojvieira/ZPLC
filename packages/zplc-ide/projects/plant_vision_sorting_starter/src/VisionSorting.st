PROGRAM VisionSorting
VAR_INPUT
    Start AT %IX0.0 : BOOL;  (* StartButton.pressed: start the line *)
    Seen  AT %IX0.1 : BOOL;  (* Vision1.detect: an item is in the field of the vision sensor *)
    Code  AT %IW1   : INT;   (* Vision1.code: the code of that item, 1 or 2, and 0 when none *)
END_VAR
VAR_OUTPUT
    RunIn   AT %QX0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunSide AT %QX0.1 : BOOL;  (* SideBelt.run: run the belt that ends in Product2 *)
    Divert  AT %QX0.2 : BOOL;  (* Arm1.divert: the arm swings across the belt while true *)
    Busy    AT %QX0.3 : BOOL;  (* Beacon.amber: the line is running *)
    Done    AT %QX0.4 : BOOL;  (* Beacon.green: lit when twelve items are sorted *)
END_VAR

(* Goal: a press of the start button runs both belts. Twelve items arrive one
   at a time on the infeed, each carrying a code, 1 or 2, for its product.
   Read Code while the item is in the field of the vision sensor. A code 1
   item rides straight on to Product1. For a code 2 item, swing the arm across
   the belt before the item reaches it, so it slides onto the side belt to
   Product2. Hold the arm across until the item has passed its free end, about
   three seconds after it reaches the arm, then swing it back. Do not decide
   about the next item until the arm is clear. Light Busy while the line runs
   and Done after the twelfth item. *)

END_PROGRAM
