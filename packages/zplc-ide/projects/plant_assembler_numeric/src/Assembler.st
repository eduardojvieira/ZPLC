PROGRAM Assembler
VAR_INPUT
    Start     AT %IX0.0 : BOOL;  (* StartButton.pressed: start the assembly *)
    LidReady  AT %IX0.1 : BOOL;  (* LidEye.detect: a lid waits at the lid blade *)
    BaseReady AT %IX0.2 : BOOL;  (* BaseEye.detect: a base waits at the base blade *)
    Gripped   AT %IX0.3 : BOOL;  (* Pick1.gripped: the pad holds a part *)
    XPos      AT %ID1   : REAL;  (* Pick1.xPos: pad position in centimetres, 0..100 for 0..1 m *)
    YPos      AT %ID2   : REAL;  (* Pick1.yPos: pad height in centimetres, 0..30 for 0..0.3 m *)
END_VAR
VAR_OUTPUT
    Grip     AT %QX0.0 : BOOL;  (* Pick1.grip: vacuum on *)
    RunLid   AT %QX0.1 : BOOL;  (* LidBelt.run: run the lid belt *)
    RunBase  AT %QX0.2 : BOOL;  (* BaseBelt.run: run the base belt *)
    RunExit  AT %QX0.3 : BOOL;  (* ExitBelt.run: run the exit belt *)
    HoldLid  AT %QX0.4 : BOOL;  (* LidBlade.extend: the blade holds the lid while true *)
    HoldBase AT %QX0.5 : BOOL;  (* BaseBlade.extend: the blade holds the base while true *)
    EmitLid  AT %QX0.6 : BOOL;  (* LidEmitter.emit: put one lid on the lid belt *)
    EmitBase AT %QX0.7 : BOOL;  (* BaseEmitter.emit: put one base on the base belt *)
    Green    AT %QX1.0 : BOOL;  (* StackLight1.green: three assemblies are done *)
    Amber    AT %QX1.1 : BOOL;  (* StackLight1.amber: the assembly is running *)
    XSet     AT %QD1   : REAL;  (* Pick1.xSet: target position in centimetres *)
    YSet     AT %QD2   : REAL;  (* Pick1.ySet: target height in centimetres *)
END_VAR

VAR
    Active    : BOOL;
    Step      : INT;   (* 0 idle, 1 raise, 2 home, 3 wait, 4 settle, 5 lower, 6 grip, 7 lift, 8 carry, 9 lower, 10 release, 11 raise, 12 return, 13 done *)
    Cycles    : INT;
    FreeBase  : BOOL;  (* the base blade is open and the assembled base is leaving *)
    SettleT   : TON;
    GripT     : TON;
    LetGoT    : TON;
    BaseLeft  : TON;
    LidGone   : F_TRIG;
    Go        : R_TRIG;
    LidsFed   : INT;
    BasesFed  : INT;
    XAt       : BOOL;  (* the pad is within the tolerance of its X target *)
    YAt       : BOOL;  (* the pad is within the tolerance of its Y target *)
END_VAR
VAR CONSTANT
    LidX   : REAL := 0.0;    (* cm: the pad is over the lid belt *)
    BaseX  : REAL := 100.0;  (* cm: the pad is over the base belt *)
    Down   : REAL := 0.0;    (* cm: the pad touches the part below it *)
    Safe   : REAL := 30.0;   (* cm: the pad clears both belts *)
    Tol    : REAL := 0.2;    (* cm: 2 mm position tolerance *)
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* one lid and one base at a time: the next lid once the pad has taken the previous one, the next base once the
   assembled one has left the blade *)
LidGone(CLK := LidReady);
BaseLeft(IN := FreeBase AND NOT BaseReady, PT := T#600ms);
Go(CLK := Start);
EmitLid := (Go.Q OR LidGone.Q) AND Active AND LidsFed < 3;
EmitBase := (Go.Q OR BaseLeft.Q) AND Active AND BasesFed < 3;
IF EmitLid THEN
    LidsFed := LidsFed + 1;
END_IF;
IF EmitBase THEN
    BasesFed := BasesFed + 1;
END_IF;
IF BaseLeft.Q THEN
    FreeBase := FALSE;
END_IF;

(* the pad: send it to a named position, then wait until it is there *)
XAt := ABS(XPos - XSet) < Tol;
YAt := ABS(YPos - YSet) < Tol;
SettleT(IN := Step = 4, PT := T#800ms);
GripT(IN := Step = 6, PT := T#400ms);
LetGoT(IN := Step = 10, PT := T#400ms);
IF Step = 0 AND Start THEN
    YSet := Safe;
    Step := 1;
ELSIF Step = 1 AND YAt THEN
    XSet := LidX;
    Step := 2;
ELSIF Step = 2 AND XAt THEN
    Step := 3;
ELSIF Step = 3 AND LidReady AND BaseReady AND NOT FreeBase THEN
    Step := 4;
ELSIF Step = 4 AND SettleT.Q THEN
    YSet := Down;
    Step := 5;
ELSIF Step = 5 AND YAt THEN
    Step := 6;
ELSIF Step = 6 AND GripT.Q AND Gripped THEN
    YSet := Safe;
    Step := 7;
ELSIF Step = 7 AND YAt THEN
    XSet := BaseX;
    Step := 8;
ELSIF Step = 8 AND XAt THEN
    YSet := Down;
    Step := 9;
ELSIF Step = 9 AND YAt THEN
    Step := 10;
ELSIF Step = 10 AND LetGoT.Q THEN
    YSet := Safe;
    Step := 11;
    Cycles := Cycles + 1;
    FreeBase := TRUE;
ELSIF Step = 11 AND YAt THEN
    XSet := LidX;
    Step := 12;
ELSIF Step = 12 AND XAt THEN
    IF Cycles >= 3 THEN
        Step := 13;
    ELSE
        Step := 3;
    END_IF;
END_IF;

Grip := Step >= 6 AND Step <= 9;

RunLid   := Active;
RunBase  := Active;
RunExit  := Active;
HoldLid  := Active;
HoldBase := Active AND NOT FreeBase;
Green    := Step = 13;
Amber    := Active AND Step <> 13;

END_PROGRAM
