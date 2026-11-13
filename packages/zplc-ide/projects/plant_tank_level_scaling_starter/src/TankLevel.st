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

(* Goal: read the level of Tank1 in metres and hold it near the set point.
   Scale LevelRaw (0 to 27648 is 0 to 1 m) and SetPointRaw (0 to 1000 is
   0 to 1 m) to metres; set the inlet to 800 percent for each metre by
   which the level is below the set point, limited to 0 to 100 percent;
   pass DrainPot to the discharge valve as a percentage (0 to 1000 is 0 to
   100 percent); show the level on the display, and light green while the
   level is within 5 percent of the set point. *)

END_PROGRAM
