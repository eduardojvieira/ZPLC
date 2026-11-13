PROGRAM LiftStacking
VAR_INPUT
    Start    AT %IX0.0 : BOOL;  (* StartButton.pressed: start the station *)
    CrateEye AT %IX0.1 : BOOL;  (* CrateEye.detect: a crate has reached the middle of the lift *)
    CountEye AT %IX0.2 : BOOL;  (* CountEye.detect: a workpiece is passing the end of the feeder *)
    OutEye   AT %IX0.3 : BOOL;  (* OutEye.detect: a crate is passing the end of the out belt *)
    AtLevel1 AT %IX0.4 : BOOL;  (* Lift1.atLevel1: the platform is at the floor belts *)
    AtLevel2 AT %IX0.5 : BOOL;  (* Lift1.atLevel2: the platform is at the feeder *)
END_VAR
VAR_OUTPUT
    EmitCrate AT %QX0.0 : BOOL;  (* CrateSource.emit: put one empty crate on the in belt *)
    EmitPart  AT %QX0.1 : BOOL;  (* PartSource.emit: put one workpiece on the feeder *)
    RunIn     AT %QX0.2 : BOOL;  (* FloorIn.run: run the in belt *)
    RunOut    AT %QX0.3 : BOOL;  (* FloorOut.run: run the out belt *)
    RunFeeder AT %QX0.4 : BOOL;  (* Feeder.run: run the feeder *)
    Up        AT %QX0.5 : BOOL;  (* Lift1.up: raise the platform while true *)
    Down      AT %QX0.6 : BOOL;  (* Lift1.down: lower the platform while true *)
    RunLift   AT %QX0.7 : BOOL;  (* Lift1.run: run the platform surface *)
    Green     AT %QX1.0 : BOOL;  (* StackLight1.green: the full crate has left the station *)
END_VAR

(* Goal: after Start, emit one crate and bring it onto the lift at level 1
   (stop when CrateEye sees it). Raise the lift to level 2 with the surface
   stopped. Feed five workpieces, one at a time: emit one, run the feeder
   and count it when CountEye ends. After each one wait until it has
   landed, then run the platform surface a short moment to move the crate,
   so the workpieces do not pile on one spot. When five are in, lower the
   lift to level 1, run the platform and the out belt until OutEye sees the
   crate leave, and light Green. Never move the lift with its surface
   running. *)

END_PROGRAM
