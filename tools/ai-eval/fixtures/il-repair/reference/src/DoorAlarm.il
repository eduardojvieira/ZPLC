PROGRAM DoorAlarm
VAR_INPUT
    Armed AT %I0.0 : BOOL;
    DoorOpen AT %I0.1 : BOOL;
    Silence AT %I0.2 : BOOL;
END_VAR
VAR_OUTPUT
    Siren AT %Q0.0 : BOOL;
END_VAR

        LD    Armed
        AND   DoorOpen
        OR    Siren
        ANDN  Silence
        ST    Siren
END_PROGRAM
