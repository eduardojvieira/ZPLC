PROGRAM ILTest
VAR
    a AT %Q0.0 : INT := 10;
    b AT %Q0.2 : INT := 20;
    res AT %Q0.4 : INT;
    flag AT %Q0.6 : BOOL;
END_VAR

LD a
ADD b
ST res

LD res
GT 25
ST flag

END_PROGRAM
