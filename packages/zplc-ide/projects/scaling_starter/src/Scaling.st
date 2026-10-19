PROGRAM Scaling
VAR_INPUT Enable AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Warn AT %Q0.0 : BOOL; Alarm AT %Q0.1 : BOOL; END_VAR
VAR Raw : DINT := 0; Percent : DINT := 0; END_VAR
IF Enable THEN Raw := MIN(Raw + 100, 1000); ELSE Raw := 0; END_IF;
Percent := (Raw / 1000) * 100;
Warn := Percent >= 50; Alarm := Percent >= 80;
END_PROGRAM
