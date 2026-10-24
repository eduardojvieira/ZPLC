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

(* Exercise: Light stays on 300 ms after Button is released (TOF). Confirmed turns on only after Sensor has been on for 200 ms (TON). *)
        LD    Button
        ST    Light
        LD    Sensor
        ST    Confirmed
END_PROGRAM
