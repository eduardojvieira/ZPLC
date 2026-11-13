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
    LevelM : REAL;  (* the level in m *)
    SetM   : REAL;  (* the set point in m *)
END_VAR

(* scale the raw values to metres: convert to REAL first, then divide by the raw span *)
LevelM := INT_TO_REAL(LevelRaw) / 27648.0;
SetM := INT_TO_REAL(SetPointRaw) / 1000.0;

(* proportional inlet: 800 percent per metre of error, limited to 0 to 100 percent *)
FillCmd := 800.0 * (SetM - LevelM);
IF FillCmd > 100.0 THEN
    FillCmd := 100.0;
END_IF;
IF FillCmd < 0.0 THEN
    FillCmd := 0.0;
END_IF;

(* the operator's disturbance: DrainPot opens the discharge, 0 to 1000 is 0 to 100 percent *)
DrainCmd := INT_TO_REAL(DrainRaw) / 10.0;

LevelShown := LevelM;
Green := ABS(SetM - LevelM) <= 0.05 * SetM;

END_PROGRAM
