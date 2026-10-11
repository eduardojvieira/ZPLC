PROGRAM ILTest
VAR
    a AT %QW0 : INT := 10;
    b AT %QW1 : INT := 20;
    res AT %QW2 : INT;
    flag AT %QX6.0 : BOOL;
END_VAR

LD a
ADD b
ST res

LD res
GT 25
ST flag

END_PROGRAM
