PROGRAM ILTest
VAR
    a AT %QW0 : INT := 10;
    b AT %QW1 : INT := 20;
    res AT %QW2 : INT;
    flag AT %QX6.0 : BOOL;
END_VAR
VAR
    IL_CR : DINT;
    IL_CR_BOOL : BOOL;
    IL_CR_REAL : REAL;
END_VAR

    IL_CR_BOOL := a <> 0;
    IL_CR := BOOL_TO_INT(IL_CR_BOOL);
END_PROGRAM
