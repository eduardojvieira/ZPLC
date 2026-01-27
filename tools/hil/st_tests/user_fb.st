FUNCTION_BLOCK MyCounter
VAR_INPUT
    Up : BOOL;
END_VAR
VAR_OUTPUT
    Count : INT := 0;
END_VAR
VAR
    prev_up : BOOL := FALSE;
END_VAR

    (* Rising Edge Detection *)
    IF Up AND NOT prev_up THEN
        Count := Count + 1;
    END_IF;
    prev_up := Up;

END_FUNCTION_BLOCK

PROGRAM UserFBTest
VAR
    c1 : MyCounter;
    clk : BOOL := FALSE;
    res_count AT %Q0.0 : INT; (* 0x1000 *)
    
    cycle : INT := 0;
END_VAR

cycle := cycle + 1;

(* Generate pulse every 2 cycles: 0->F, 1->F, 2->T, 3->F, 4->T ... *)
clk := (cycle MOD 2) = 0;

c1(Up := clk);
res_count := c1.Count;

END_PROGRAM
