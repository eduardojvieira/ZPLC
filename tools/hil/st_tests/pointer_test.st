PROGRAM PointerTest
VAR
    val : INT;
    ptr : REF_TO INT;
    
    res_read AT %Q0.0 : INT; (* 0x1000 *)
    res_write AT %Q2.0 : INT; (* 0x1002 *)
END_VAR

(* Initialize val each cycle to verify read before write *)
val := 42;

(* 1. Reference *)
ptr := REF(val);

(* 2. Dereference Read *)
res_read := ptr^;

(* 3. Dereference Write *)
ptr^ := 99;
res_write := val;

END_PROGRAM
