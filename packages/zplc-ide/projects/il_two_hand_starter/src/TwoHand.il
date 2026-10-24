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

(* Exercise: PressEnable needs both hands AND a closed guard; GuardLamp shows an open guard; OneHandWarning shows exactly one hand. *)
        LD    LeftHand
        OR    RightHand
        ST    PressEnable
        LD    FALSE
        ST    GuardLamp
        ST    OneHandWarning
END_PROGRAM
