PROGRAM ComplexTypes
VAR
    matrix : ARRAY[0..1, 0..1] OF INT;
    sum : INT;

    (* Result on the output image, byte 0 (0x1000) *)
    res_x AT %QW0 : INT;
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
