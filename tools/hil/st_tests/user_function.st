FUNCTION Hypotenuse : REAL
VAR_INPUT
    a : REAL;
    b : REAL;
END_VAR
    Hypotenuse := SQRT(a*a + b*b);
END_FUNCTION

PROGRAM UserFuncTest
VAR
    res AT %Q0.0 : REAL; (* 0x1000 *)
    cycle AT %Q0.4 : INT; (* 0x1004 *)
    counter : INT := 0;
END_VAR

counter := counter + 1;
cycle := counter;

res := Hypotenuse(3.0, 4.0);

END_PROGRAM
