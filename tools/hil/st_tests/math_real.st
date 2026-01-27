PROGRAM MathReal
VAR
    angles : ARRAY[0..2] OF REAL;
    sines : ARRAY[0..2] OF REAL;
    i : INT;
    
    (* OPI Layout: *)
    (* 0x1000: result_ok (INT, 2 bytes) *)
    (* 0x1004: debug_val (REAL, 4 bytes) *)
    
    result_ok AT %Q0.0 : INT; 
    debug_val AT %Q4.0 : REAL; 
END_VAR

angles[0] := 0.0;
angles[1] := 1.570796;
angles[2] := 3.141592;

FOR i := 0 TO 2 DO
    sines[i] := SIN(angles[i]);
END_FOR;

(* Store result for debugging *)
debug_val := sines[1];

IF sines[1] > 0.99 AND sines[1] < 1.01 THEN
    result_ok := 1;
ELSE
    result_ok := 0;
END_IF;

END_PROGRAM
