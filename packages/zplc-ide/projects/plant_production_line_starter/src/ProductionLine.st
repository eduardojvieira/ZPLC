(* Goal: after Start, run the belts and send the eight blanks to the two machines
   so that machine A (lids, 3 s) and machine B (bases, 6 s) each make four.
   Machine A is controlled inline below. Move that control into a function block
   Cell, use one instance for machine A and one for machine B, and light Green
   when each machine has finished four cycles. *)

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

VAR
    Active   : BOOL;
    StepA    : INT;    (* machine A: 0 wait for a blank, 1 carry it in, 2 wait for Ready, 3 start, 4 cycle runs, 5 carry the product out *)
    TravelA  : TON;
    EjectA   : TON;
    CyclesA  : INT;    (* finished cycles of machine A *)
    Blanks   : INT;    (* blanks seen at the gate *)
    PrevGate : BOOL;
    WantB    : BOOL;   (* the blank last read at the gate is for machine B *)
    Across   : BOOL;   (* the arm is across the belt *)
    Hold     : TON;
    Made     : INT;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* every second blank goes to machine B: the blanks alternate, so both machines make four *)
IF Gate AND NOT PrevGate THEN
    Blanks := Blanks + 1;
    WantB := Blanks MOD 2 = 0;
    IF WantB THEN
        Across := TRUE;
    END_IF;
END_IF;
PrevGate := Gate;

(* the blank is 1.6 s from the gate to the arm and follows the arm for about 2.4 s: across for 5 s *)
Hold(IN := Across, PT := T#5000ms);
IF Hold.Q THEN
    Across := FALSE;
END_IF;
Divert := Active AND Across;

(* machine A, written inline: the control of one machine in this program *)
StartA := FALSE;
TravelA(IN := StepA = 1, PT := T#1600ms);
EjectA(IN := StepA = 5, PT := T#2500ms);
IF StepA = 0 THEN
    IF Active AND EyeA THEN
        StepA := 1;
    END_IF;
ELSIF StepA = 1 THEN
    IF TravelA.Q THEN
        StepA := 2;
    END_IF;
ELSIF StepA = 2 THEN
    IF ReadyA THEN
        StartA := TRUE;
        StepA := 3;
    END_IF;
ELSIF StepA = 3 THEN
    StepA := 4;
ELSIF StepA = 4 THEN
    IF DoneA THEN
        CyclesA := CyclesA + 1;
        StepA := 5;
    END_IF;
ELSIF StepA = 5 THEN
    IF EjectA.Q THEN
        StepA := 0;
    END_IF;
END_IF;
FeedA := Active AND (StepA = 0 OR StepA = 1 OR StepA = 5);

RunInfeed := Active;
RunBranch := Active;
RunOutA := Active;
RunOutB := Active;


END_PROGRAM
