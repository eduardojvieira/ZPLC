PROGRAM Warehouse
VAR_INPUT
    Start   AT %IX0.0 : BOOL;  (* StartButton.pressed: start the warehouse *)
    Req1    AT %IX0.1 : BOOL;  (* Req1.pressed: retrieve the box of cell 1 *)
    Req2    AT %IX0.2 : BOOL;  (* Req2.pressed: retrieve the box of cell 2 *)
    Req3    AT %IX0.3 : BOOL;  (* Req3.pressed: retrieve the box of cell 3 *)
    InEye   AT %IX0.4 : BOOL;  (* InEye.detect: a box waits at the end of the infeed belt *)
    InPos   AT %IX0.5 : BOOL;  (* Crane1.inPosition: both axes are at their setpoint *)
    Raised  AT %IX0.6 : BOOL;  (* Crane1.raised: the fork is raised *)
    Centre  AT %IX0.7 : BOOL;  (* Crane1.forkCentre: the fork is retracted *)
    AtLeft  AT %IX1.0 : BOOL;  (* Crane1.forkAtLeft: the fork is out towards the infeed *)
    AtRight AT %IX1.1 : BOOL;  (* Crane1.forkAtRight: the fork is out towards the rack and the outfeed *)
    Loaded  AT %IX1.2 : BOOL;  (* Crane1.loaded: a box rests on the fork *)
END_VAR
VAR_OUTPUT
    Bay       AT %QW1   : INT;   (* Crane1.bay: 0 is the dock, 1 to 3 are the columns *)
    Level     AT %QW2   : INT;   (* Crane1.level: 0 is the dock, 1 and 2 are the shelves *)
    Raise     AT %QX0.0 : BOOL;  (* Crane1.raise: raise the fork 0.06 m *)
    ForkLeft  AT %QX0.1 : BOOL;  (* Crane1.forkLeft: extend the fork towards the infeed while true *)
    ForkRight AT %QX0.2 : BOOL;  (* Crane1.forkRight: extend the fork towards the rack and the outfeed while true *)
    BeltRight AT %QX0.3 : BOOL;  (* Crane1.beltRight: run the fork surface towards +z *)
    RunIn     AT %QX0.4 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunOut    AT %QX0.5 : BOOL;  (* Outfeed.run: run the outfeed belt *)
    Green     AT %QX0.6 : BOOL;  (* StackLight1.green: every request is served *)
END_VAR

(* Goal: after Start, run the infeed belt until InEye sees a box. Store each
   box in the first free cell of level 1 (column 1, then 2, then 3) and keep
   a table of the occupied cells. The store sequence is: fork out to the
   left and raised, take the box onto the fork with beltRight, retract,
   move to the cell, fork out to the right, lower it, retract, go back to
   the dock. A request button retrieves the box of its cell: fork out to
   the right lowered, raise it, retract, go to the dock, fork out to the
   right and run beltRight until Loaded ends, with the outfeed running.
   Move the crane only with the fork retracted, wait 0.3 s after a new
   setpoint before you trust InPos, and light Green once two boxes have
   left the warehouse. *)

END_PROGRAM
