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

(* Goal: keep the level of Tank1 at the set point with a PID loop.
   Scale LevelRaw and SetPointRaw to metres, run PID_Compact from the set
   point to the inlet valve (Tank1.fill, 0 to 100 percent, scan time 0.01 s),
   pass DrainPot to the discharge valve as a percentage, show the level on
   the display, and light green while the level is within 5 percent of the
   set point. *)

END_PROGRAM
