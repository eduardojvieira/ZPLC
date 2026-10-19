PROGRAM Delays
VAR_INPUT Button AT %I0.0 : BOOL; Sensor AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT Light AT %Q0.0 : BOOL; Confirmed AT %Q0.1 : BOOL; END_VAR
VAR HoldTimer : TOF; FilterTimer : TON; END_VAR
HoldTimer(IN := Button, PT := T#300ms); Light := HoldTimer.Q;
FilterTimer(IN := Sensor, PT := T#200ms); Confirmed := FilterTimer.Q;
END_PROGRAM
