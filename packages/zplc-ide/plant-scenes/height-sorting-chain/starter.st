PROGRAM HeightSortChain
VAR_INPUT
    Start       AT %I0.0 : BOOL;  (* StartButton.pressed: start the line *)
    Low         AT %I0.1 : BOOL;  (* BeamLow.detect: a box 0.30 m or 0.40 m high breaks the lower beam *)
    High        AT %I0.2 : BOOL;  (* BeamHigh.detect: a box 0.40 m high breaks the upper beam *)
    AtBlade     AT %I0.3 : BOOL;  (* EyeChain.detect: a box stands against the blade on the transfer *)
    Raised      AT %I0.4 : BOOL;  (* Chain1.raised: the chain module is up *)
    Lowered     AT %I0.5 : BOOL;  (* Chain1.lowered: the chain module is down *)
END_VAR
VAR_OUTPUT
    RunIn       AT %Q0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    RunChain    AT %Q0.1 : BOOL;  (* Chain1.run: run the module straight on while it is down *)
    Lift        AT %Q0.2 : BOOL;  (* Chain1.lift: raise the module while true *)
    MoveRight   AT %Q0.3 : BOOL;  (* Chain1.moveRight: move a box to the right belt (module up) *)
    MoveLeft    AT %Q0.4 : BOOL;  (* Chain1.moveLeft: move a box to the left belt (module up) *)
    RunStraight AT %Q0.5 : BOOL;  (* Straight.run: run the belt beyond the transfer *)
    RunRight    AT %Q0.6 : BOOL;  (* SideRight.run: run the right belt *)
    RunLeft     AT %Q0.7 : BOOL;  (* SideLeft.run: run the left belt *)
    Hold        AT %Q1.0 : BOOL;  (* Stop1.extend: the blade holds a box on the module while true *)
    Busy        AT %Q1.1 : BOOL;  (* Beacon.amber: the line is running *)
    Done        AT %Q1.2 : BOOL;  (* Beacon.green: lit when nine boxes have been sorted *)
END_VAR

(* Goal: a press of the start button runs every belt. Boxes of three heights (0.20, 0.30 and
   0.40 m) arrive on the infeed, one every five seconds, nine in all. Tell the height from the
   two beams while the box passes them: 0.20 m breaks neither, 0.30 m only the lower, 0.40 m both.
   Remember the answer, because the box reaches the transfer later and the next box may pass the
   beams before this one is done.
   A box stops against the blade on the chain module (hold the blade, and run the module so that
   the box is pushed against it). Once it has stood still for a second:
     - 0.20 m: release the blade and run the module; the box goes straight on to the short bin;
     - 0.30 m: stop the module, lift it, wait until it is up and has rested a moment, then move
       right until the box is on the right belt, and lower the module (medium bin);
     - 0.40 m: the same, to the left (tall bin).
   Never run the module and lift it at the same time. Light Busy while the line runs and Done when
   nine boxes have been sorted. *)

END_PROGRAM
