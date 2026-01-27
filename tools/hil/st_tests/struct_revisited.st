TYPE
    Point : STRUCT
        x : INT;
        y : INT;
    END_STRUCT;
END_TYPE

PROGRAM StructTest
VAR
    p1 : Point;
    sum AT %Q0.0 : INT; (* 0x1000 *)
END_VAR

p1.x := 10;
p1.y := 20;
sum := p1.x + p1.y;

END_PROGRAM
