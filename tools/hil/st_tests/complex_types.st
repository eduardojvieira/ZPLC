PROGRAM ComplexTypes
VAR
    matrix : ARRAY[0..1, 0..1] OF INT;
    sum : INT;
    
    (* Results mapped to OPI *)
    res_x AT %Q0.0 : INT;  (* 0x1000 *)
END_VAR

(* Initialize Matrix *)
matrix[0,0] := 10;
matrix[0,1] := 20;
matrix[1,0] := 30;
matrix[1,1] := 40;

(* Calculate diagonal sum: 10 + 40 = 50 *)
sum := matrix[0,0] + matrix[1,1];

(* Output *)
res_x := sum;

END_PROGRAM
