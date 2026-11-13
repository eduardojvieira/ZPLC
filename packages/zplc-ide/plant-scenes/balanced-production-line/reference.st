FUNCTION_BLOCK Cell
VAR_INPUT
    Active : BOOL;  (* the line is running *)
    Seen   : BOOL;  (* the sensor in front of the machine *)
    Ready  : BOOL;  (* one blank lies at rest in the machine *)
    Done   : BOOL;  (* the machine has finished a product *)
END_VAR
VAR_OUTPUT
    Feed   : BOOL;  (* run the belt inside the machine *)
    Start  : BOOL;  (* rising edge: start a cycle *)
    Cycles : INT;   (* finished cycles *)
END_VAR
VAR
    Step   : INT;   (* 0 wait for a blank, 1 carry it in, 2 wait for Ready, 3 start, 4 cycle runs, 5 carry the product out *)
    Travel : TON;
    Eject  : TON;
END_VAR

Start := FALSE;
Travel(IN := Step = 1, PT := T#1600ms);
Eject(IN := Step = 5, PT := T#2500ms);

IF Step = 0 THEN
    IF Active AND Seen THEN
        Step := 1;
    END_IF;
ELSIF Step = 1 THEN
    (* the blank needs 1.6 s from the sensor to the middle of the chamber at 0.5 m/s *)
    IF Travel.Q THEN
        Step := 2;
    END_IF;
ELSIF Step = 2 THEN
    IF Ready THEN
        Start := TRUE;
        Step := 3;
    END_IF;
ELSIF Step = 3 THEN
    Step := 4;
ELSIF Step = 4 THEN
    IF Done THEN
        Cycles := Cycles + 1;
        Step := 5;
    END_IF;
ELSIF Step = 5 THEN
    IF Eject.Q THEN
        Step := 0;
    END_IF;
END_IF;

(* the belt runs to take a blank in and to take the product out, and stops while the blank settles and the cycle runs *)
Feed := Active AND (Step = 0 OR Step = 1 OR Step = 5);
END_FUNCTION_BLOCK

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
    MachA    : Cell;
    MachB    : Cell;
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

MachA(Active := Active, Seen := EyeA, Ready := ReadyA, Done := DoneA);
MachB(Active := Active, Seen := EyeB, Ready := ReadyB, Done := DoneB);
FeedA := MachA.Feed;
StartA := MachA.Start;
FeedB := MachB.Feed;
StartB := MachB.Start;

RunInfeed := Active;
RunBranch := Active;
RunOutA := Active;
RunOutB := Active;

Green := MachA.Cycles >= 4 AND MachB.Cycles >= 4;

END_PROGRAM
