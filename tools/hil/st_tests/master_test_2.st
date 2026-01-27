PROGRAM MasterTest2
VAR
    test_cycle : INT := 0;
    timer_off : TOF;
    timer_pulse : TP;
    i : INT;
    sum : INT := 0;
    case_val : INT := 0;
    
    (* Resultados en WORK (para que no los pise el stop) *)
    res_tof : BOOL;   
    res_tp : BOOL;    
    res_for : INT;    
    res_case : INT;   
END_VAR

test_cycle := test_cycle + 1;

timer_off(IN := (test_cycle = 5), PT := T#500ms);
IF test_cycle = 10 AND timer_off.Q THEN
    res_tof := TRUE;
END_IF;

timer_pulse(IN := (test_cycle = 5), PT := T#500ms);
IF test_cycle = 7 AND timer_pulse.Q THEN
    res_tp := TRUE;
END_IF;

IF test_cycle = 10 THEN
    sum := 0;
    FOR i := 1 TO 5 DO
        sum := sum + i;
    END_FOR;
    res_for := sum;
END_IF;

IF test_cycle = 10 THEN
    case_val := 2;
    CASE case_val OF
        1: res_case := 100;
        2: res_case := 200;
    ELSE
        res_case := 0;
    END_CASE;
END_IF;

END_PROGRAM
