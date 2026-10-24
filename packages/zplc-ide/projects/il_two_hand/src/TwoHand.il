PROGRAM TwoHand
VAR_INPUT
    LeftHand AT %I0.0 : BOOL;
    RightHand AT %I0.1 : BOOL;
    GuardClosed AT %I0.2 : BOOL;
END_VAR
VAR_OUTPUT
    PressEnable AT %Q0.0 : BOOL;
    GuardLamp AT %Q0.1 : BOOL;
    OneHandWarning AT %Q0.2 : BOOL;
END_VAR

        LD    LeftHand
        AND   RightHand
        AND   GuardClosed
        ST    PressEnable
        LDN   GuardClosed
        ST    GuardLamp
        LD    LeftHand
        XOR   RightHand
        ST    OneHandWarning
END_PROGRAM
