PROGRAM TankLevel
VAR_INPUT
    LevelRaw    AT %IW0 : INT;  (* Tank1.level: 0 to 27648 is 0 to 1 m *)
    SetPointRaw AT %IW1 : INT;  (* SetPoint.value: 0 to 1000 is 0 to 1 m *)
    DrainRaw    AT %IW2 : INT;  (* DrainPot.value: 0 to 1000 is 0 to 100 percent *)
END_VAR
VAR_OUTPUT
    FillCmd    AT %QD0 : REAL;  (* Tank1.fill: 0 to 100 percent of the inlet valve *)
    DrainCmd   AT %QD1 : REAL;  (* Tank1.drain: 0 to 100 percent of the discharge valve *)
    LevelShown AT %QD2 : REAL;  (* LevelDisplay.value: the level in m *)
    Green      AT %QX12.0 : BOOL;  (* StackLight1.green: the level is within 5 percent of the set point *)
END_VAR

VAR
    Pid     : PID_Compact;
    LevelM  : REAL;  (* the level in m *)
    SetM    : REAL;  (* the set point in m *)
END_VAR

(* the raw values are scaled once, here, to the units the loop is tuned in *)
LevelM := INT_TO_REAL(LevelRaw) / 27648.0;
SetM := INT_TO_REAL(SetPointRaw) / 1000.0;

(* PID loop: set point to the inlet valve, 0 to 100 percent, scan time 0.01 s.
   The tank has no passive outlet, so a level above the set point only falls
   when the discharge opens: KD keeps the overshoot near 0.03 m, and a large
   KP keeps the offset under the DrainPot disturbance inside the 5 percent
   band while KI slowly removes it. *)
Pid(SP := SetM, PV := LevelM, KP := 800.0, KI := 10.0, KD := 150.0, DT := 0.01, OUT_MIN := 0.0, OUT_MAX := 100.0);
FillCmd := Pid.OUT;

(* the operator's disturbance: DrainPot opens the discharge, 0 to 1000 is 0 to 100 percent *)
DrainCmd := INT_TO_REAL(DrainRaw) / 10.0;

LevelShown := LevelM;
Green := ABS(SetM - LevelM) <= 0.05 * SetM;

END_PROGRAM
