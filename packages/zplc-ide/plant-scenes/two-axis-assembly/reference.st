PROGRAM Assembler
VAR_INPUT
    Start     AT %I0.0 : BOOL;  (* StartButton.pressed: start the assembly *)
    LidReady  AT %I0.1 : BOOL;  (* LidEye.detect: a lid waits at the lid blade *)
    BaseReady AT %I0.2 : BOOL;  (* BaseEye.detect: a base waits at the base blade *)
    XAtMin    AT %I0.3 : BOOL;  (* Pick1.xAtMin: the pad is over the lid belt *)
    XAtMax    AT %I0.4 : BOOL;  (* Pick1.xAtMax: the pad is over the base belt *)
    YAtMin    AT %I0.5 : BOOL;  (* Pick1.yAtMin: the pad is down *)
    YAtMax    AT %I0.6 : BOOL;  (* Pick1.yAtMax: the pad is up *)
    Gripped   AT %I0.7 : BOOL;  (* Pick1.gripped: the pad holds a part *)
END_VAR
VAR_OUTPUT
    XPlus    AT %Q0.0 : BOOL;  (* Pick1.xPlus: move the pad toward the base belt while true *)
    XMinus   AT %Q0.1 : BOOL;  (* Pick1.xMinus: move the pad toward the lid belt while true *)
    YPlus    AT %Q0.2 : BOOL;  (* Pick1.yPlus: raise the pad while true *)
    YMinus   AT %Q0.3 : BOOL;  (* Pick1.yMinus: lower the pad while true *)
    Grip     AT %Q0.4 : BOOL;  (* Pick1.grip: vacuum on *)
    RunLid   AT %Q0.5 : BOOL;  (* LidBelt.run: run the lid belt *)
    RunBase  AT %Q0.6 : BOOL;  (* BaseBelt.run: run the base belt *)
    RunExit  AT %Q0.7 : BOOL;  (* ExitBelt.run: run the exit belt *)
    HoldLid  AT %Q1.0 : BOOL;  (* LidBlade.extend: the blade holds the lid while true *)
    HoldBase AT %Q1.1 : BOOL;  (* BaseBlade.extend: the blade holds the base while true *)
    EmitLid  AT %Q1.2 : BOOL;  (* LidEmitter.emit: put one lid on the lid belt *)
    EmitBase AT %Q1.3 : BOOL;  (* BaseEmitter.emit: put one base on the base belt *)
    Green    AT %Q1.4 : BOOL;  (* StackLight1.green: three assemblies are done *)
    Amber    AT %Q1.5 : BOOL;  (* StackLight1.amber: the assembly is running *)
END_VAR

VAR
    Active    : BOOL;
    Step      : INT;   (* 0 idle, 1 home, 2 wait, 3 settle, 4 lower, 5 grip, 6 lift, 7 carry, 8 lower, 9 release, 10 raise, 11 return, 12 done *)
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

(* the pad: lower, grip the lid, raise, carry, lower, release, raise, return; every move waits for its limit switch *)
SettleT(IN := Step = 3, PT := T#800ms);
GripT(IN := Step = 5, PT := T#400ms);
LetGoT(IN := Step = 9, PT := T#400ms);
IF Step = 0 AND Start THEN
    Step := 1;
ELSIF Step = 1 AND YAtMax AND XAtMin THEN
    Step := 2;
ELSIF Step = 2 AND LidReady AND BaseReady AND NOT FreeBase THEN
    Step := 3;
ELSIF Step = 3 AND SettleT.Q THEN
    Step := 4;
ELSIF Step = 4 AND YAtMin THEN
    Step := 5;
ELSIF Step = 5 AND GripT.Q AND Gripped THEN
    Step := 6;
ELSIF Step = 6 AND YAtMax THEN
    Step := 7;
ELSIF Step = 7 AND XAtMax THEN
    Step := 8;
ELSIF Step = 8 AND YAtMin THEN
    Step := 9;
ELSIF Step = 9 AND LetGoT.Q THEN
    Step := 10;
    Cycles := Cycles + 1;
    FreeBase := TRUE;
ELSIF Step = 10 AND YAtMax THEN
    Step := 11;
ELSIF Step = 11 AND XAtMin THEN
    IF Cycles >= 3 THEN
        Step := 12;
    ELSE
        Step := 2;
    END_IF;
END_IF;

XPlus  := Step = 7 AND NOT XAtMax;
XMinus := (Step = 1 OR Step = 11) AND NOT XAtMin;
YPlus  := (Step = 1 OR Step = 6 OR Step = 10) AND NOT YAtMax;
YMinus := (Step = 4 OR Step = 8) AND NOT YAtMin;
Grip   := Step >= 5 AND Step <= 8;

RunLid   := Active;
RunBase  := Active;
RunExit  := Active;
HoldLid  := Active;
HoldBase := Active AND NOT FreeBase;
Green    := Step = 12;
Amber    := Active AND Step <> 12;

END_PROGRAM
