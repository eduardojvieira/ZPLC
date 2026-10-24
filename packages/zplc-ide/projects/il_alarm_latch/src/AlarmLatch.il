PROGRAM AlarmLatch
VAR_INPUT
    Fault AT %I0.0 : BOOL;
    Ack AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    SetFirst AT %Q0.0 : BOOL;
    ResetFirst AT %Q0.1 : BOOL;
END_VAR

        LD    Ack
        R     SetFirst
        LD    Fault
        S     SetFirst
        LD    Fault
        S     ResetFirst
        LD    Ack
        R     ResetFirst
END_PROGRAM
