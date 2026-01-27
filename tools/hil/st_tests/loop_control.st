PROGRAM LoopControl
VAR
    i : INT;
    j : INT;
    sum : INT := 0;
    
    res_exit AT %Q0.0 : INT;    (* 0x1000 *)
    res_cont AT %Q2.0 : INT;    (* 0x1002 *)
END_VAR

(* EXIT Test: Stop at 5 *)
FOR i := 1 TO 10 DO
    IF i = 5 THEN
        EXIT;
    END_IF;
END_FOR;
res_exit := i;

(* CONTINUE Test: Sum all except 3 (1+2+4+5=12) *)
sum := 0;
FOR j := 1 TO 5 DO
    IF j = 3 THEN
        CONTINUE;
    END_IF;
    sum := sum + j;
END_FOR;
res_cont := sum;

END_PROGRAM
