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

VAR
    Active  : BOOL;
    Step    : INT;   (* 0 wait, 1 crate onto the lift, 2 raise, 3 feed one part, 4 wait for it to land, 5 move the crate, 6 lower, 7 crate out *)
    Parts   : INT;   (* workpieces counted into the crate *)
    Pending : BOOL;  (* a workpiece is on its way *)
    Landing : TON;
    Moving  : TON;
    PartPast : F_TRIG;
    CrateOut : F_TRIG;
    Left     : BOOL;
END_VAR

EmitCrate := Start AND NOT Active;

IF Start THEN
    Active := TRUE;
END_IF;

PartPast(CLK := CountEye);
CrateOut(CLK := OutEye);
Landing(IN := Step = 4, PT := T#1800ms);
Moving(IN := Step = 5, PT := T#300ms);

EmitPart := FALSE;

IF Step = 0 THEN
    IF Active THEN
        Step := 1;
    END_IF;
ELSIF Step = 1 THEN
    IF CrateEye AND AtLevel1 THEN
        Step := 2;
    END_IF;
ELSIF Step = 2 THEN
    IF AtLevel2 THEN
        Step := 3;
    END_IF;
ELSIF Step = 3 THEN
    IF NOT Pending THEN
        EmitPart := TRUE;
        Pending := TRUE;
    END_IF;
    IF PartPast.Q THEN
        Parts := Parts + 1;
        Step := 4;
    END_IF;
ELSIF Step = 4 THEN
    IF Landing.Q THEN
        Pending := FALSE;
        IF Parts >= 5 THEN
            Step := 6;
        ELSE
            Step := 5;
        END_IF;
    END_IF;
ELSIF Step = 5 THEN
    IF Moving.Q THEN
        Step := 3;
    END_IF;
ELSIF Step = 6 THEN
    IF AtLevel1 THEN
        Step := 7;
    END_IF;
ELSIF Step = 7 THEN
    IF CrateOut.Q THEN
        Left := TRUE;
    END_IF;
END_IF;

(* the platform surface runs only while the lift is at rest at level 1 or to move the crate under the feeder *)
RunIn := Step = 1;
RunLift := (Step = 1 AND NOT CrateEye) OR Step = 5 OR Step = 7;
RunOut := Step = 7;
RunFeeder := Step = 3 OR Step = 4;
Up := Step = 2;
Down := Step = 6;
Green := Left;

END_PROGRAM
