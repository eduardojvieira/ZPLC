PROGRAM LoopTest
VAR
    i : INT := 0;
    j : INT := 0;
    
    res_while AT %Q0.0 : INT;  (* 0x1000 *)
    res_repeat AT %Q2.0 : INT; (* 0x1002 *)
END_VAR

(* WHILE Loop *)
WHILE i < 10 DO
    i := i + 1;
END_WHILE;
res_while := i;

(* REPEAT Loop *)
REPEAT
    j := j + 1;
UNTIL j = 20
END_REPEAT;
res_repeat := j;

(* Reset for next cycle *)
IF i >= 10 THEN i := 0; END_IF;
IF j >= 20 THEN j := 0; END_IF;

END_PROGRAM
