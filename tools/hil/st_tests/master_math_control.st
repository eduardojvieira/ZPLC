PROGRAM MathControlTest
VAR
    (* Math Results *)
    res_sqrt AT %Q0.4 : REAL;   (* 0x1004 *)
    res_ln AT %Q0.8 : REAL;     (* 0x1008 *)
    res_sin AT %Q0.12 : REAL;   (* 0x100C *)
    res_expt AT %Q0.16 : INT;   (* 0x1010 *)
    
    (* Control Results *)
    res_for AT %Q0.18 : INT;    (* 0x1012 *)
    res_case AT %Q0.20 : INT;   (* 0x1014 *)
    
    (* Internal vars *)
    i : INT;
    temp_sum : INT := 0;
    case_sel : INT := 2;
END_VAR

(* 1. Math Tests *)
res_sqrt := SQRT(2.0);
res_ln := LN(2.7182818);
res_sin := SIN(1.570796);
res_expt := EXPT(2, 8);

(* 2. FOR loop test *)
temp_sum := 0;
FOR i := 1 TO 10 DO
    temp_sum := temp_sum + i;
END_FOR;
res_for := temp_sum;

(* 3. CASE test *)
CASE case_sel OF
    1: res_case := 10;
    2: res_case := 20;
    3: res_case := 30;
ELSE
    res_case := 99;
END_CASE;

END_PROGRAM
