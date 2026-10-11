PROGRAM MathControlTest
VAR
    (* Math Results *)
    res_sqrt AT %QD1 : REAL;   (* 0x1004 *)
    res_ln AT %QD2 : REAL;     (* 0x1008 *)
    res_sin AT %QD3 : REAL;   (* 0x100C *)
    res_expt AT %QW8 : INT;   (* 0x1010 *)
    
    (* Control Results *)
    res_for AT %QW9 : INT;    (* 0x1012 *)
    res_case AT %QW10 : INT;   (* 0x1014 *)
    
    (* Internal vars *)
    i : INT;
    temp_sum : INT := 0;
    case_sel : INT := 2;
END_VAR

(* 1. Math Tests *)
res_sqrt := SQRT(2.0);
res_ln := LN(2.7182818);
res_sin := SIN(1.570796);
res_expt := REAL_TO_INT(EXPT(2.0, 8));

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
