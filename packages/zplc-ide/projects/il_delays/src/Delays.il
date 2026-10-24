PROGRAM Delays
VAR_INPUT
    Button AT %I0.0 : BOOL;
    Sensor AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    Light AT %Q0.0 : BOOL;
    Confirmed AT %Q0.1 : BOOL;
END_VAR
VAR
    HoldTimer : TOF;
    FilterTimer : TON;
END_VAR

        CAL   HoldTimer(IN := Button, PT := T#300ms)
        LD    HoldTimer.Q
        ST    Light
        CAL   FilterTimer(IN := Sensor, PT := T#200ms)
        LD    FilterTimer.Q
        ST    Confirmed
END_PROGRAM
