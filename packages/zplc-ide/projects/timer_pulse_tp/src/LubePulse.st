PROGRAM LubePulse
VAR_INPUT Press AT %I0.0 : BOOL; GuardClosed AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT Pump AT %QX0.0 : BOOL; END_VAR
VAR Shot : TP; END_VAR
Shot(IN := Press AND GuardClosed, PT := T#500ms);
Pump := Shot.Q;
END_PROGRAM
