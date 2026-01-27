PROGRAM ILTest
VAR
    a AT %Q0.0 : INT := 10;
    b AT %Q0.2 : INT := 20;
    res AT %Q0.4 : INT;
    flag AT %Q0.6 : BOOL;
END_VAR
VAR
    IL_CR : DINT;
    IL_CR_BOOL : BOOL;
    IL_CR_REAL : REAL;
END_VAR

    IL_CR_BOOL := a;
    IL_CR := BOOL_TO_INT(IL_CR_BOOL);
END_PROGRAM
