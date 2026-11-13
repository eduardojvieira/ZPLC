PROGRAM ProductionLine
VAR_INPUT
    Start  AT %IX0.0 : BOOL;  (* StartButton.pressed: start the line *)
    Gate   AT %IX0.1 : BOOL;  (* Gate.detect: a blank is in front of the arm *)
    EyeA   AT %IX0.2 : BOOL;  (* EyeA.detect: a blank is about to enter machine A *)
    EyeB   AT %IX0.3 : BOOL;  (* EyeB.detect: a blank is about to enter machine B *)
    ReadyA AT %IX0.4 : BOOL;  (* MachineA.ready: one blank lies at rest in machine A *)
    DoneA  AT %IX0.5 : BOOL;  (* MachineA.done: machine A has finished a lid *)
    ReadyB AT %IX0.6 : BOOL;  (* MachineB.ready: one blank lies at rest in machine B *)
    DoneB  AT %IX0.7 : BOOL;  (* MachineB.done: machine B has finished a base *)
END_VAR
VAR_OUTPUT
    RunInfeed  AT %QX0.0 : BOOL;  (* Infeed.run *)
    RunBranch  AT %QX0.1 : BOOL;  (* BranchB.run: the branch to machine B *)
    RunOutA    AT %QX0.2 : BOOL;  (* OutA.run: the belt from machine A to the lid bin *)
    RunOutB    AT %QX0.3 : BOOL;  (* OutB.run: the belt from machine B to the base bin *)
    Divert     AT %QX0.4 : BOOL;  (* Arm1.divert: send a blank to machine B *)
    FeedA      AT %QX0.5 : BOOL;  (* MachineA.feed: run the belt inside machine A *)
    StartA     AT %QX0.6 : BOOL;  (* MachineA.start: a rising edge starts a 3 s cycle *)
    FeedB      AT %QX1.0 : BOOL;  (* MachineB.feed *)
    StartB     AT %QX1.1 : BOOL;  (* MachineB.start: a rising edge starts a 6 s cycle *)
    Green      AT %QX1.2 : BOOL;  (* Beacon.green: four lids and four bases are made *)
END_VAR

(* Goal: after Start, run the belts and send the eight blanks to the two machines
   so that machine A (lids, 3 s) and machine B (bases, 6 s) each make four.
   Alternate the blanks: the arm sends every second blank to machine B.
   A machine runs its feed until a blank has entered, stops it, waits for
   Ready, then pulses Start and runs the feed again after Done to take the
   product out. Light Green when each machine has finished four cycles. *)

END_PROGRAM
