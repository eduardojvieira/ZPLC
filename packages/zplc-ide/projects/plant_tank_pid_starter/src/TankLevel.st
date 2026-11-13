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
    Pid    : PID_Compact;
    LevelM : REAL;  (* the level in m *)
    SetM   : REAL;  (* the set point in m *)
END_VAR

(* the raw values are scaled once, here, to the units the loop is tuned in *)
LevelM := INT_TO_REAL(LevelRaw) / 27648.0;
SetM := INT_TO_REAL(SetPointRaw) / 1000.0;

(* Goal: keep the level of Tank1 at the set point with PID_Compact.
   Call Pid with SP := SetM, PV := LevelM, DT := 0.01 (the scan time in
   seconds), OUT_MIN := 0.0, OUT_MAX := 100.0 and gains KP, KI and KD that
   you tune, and send Pid.OUT to FillCmd (the inlet, 0 to 100 percent).
   Pass DrainPot to the discharge valve (DrainRaw / 10.0, percent), show
   the level on the display, and light green while the level is within 5
   percent of the set point. *)

END_PROGRAM
