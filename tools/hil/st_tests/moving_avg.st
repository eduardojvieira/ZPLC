PROGRAM MovingAvg
VAR
    buffer : ARRAY[0..4] OF INT;
    i : INT;
    sum : DINT;
    avg AT %Q0.0 : INT; (* Result at 0x1000 *)
    
    raw_val : INT := 0;
    counter : INT := 0;
END_VAR

(* Simulate Input *)
counter := counter + 10;
IF counter > 100 THEN
    counter := 0;
END_IF;
raw_val := counter;

(* Shift Buffer (Unrolled to avoid negative step compiler bug) *)
buffer[4] := buffer[3];
buffer[3] := buffer[2];
buffer[2] := buffer[1];
buffer[1] := buffer[0];

(* Insert new value *)
buffer[0] := raw_val;

(* Calculate Average *)
sum := 0;
FOR i := 0 TO 4 DO
    (* Implicit conversion INT to DINT is handled by VM stack *)
    sum := sum + buffer[i];
END_FOR;

(* Implicit conversion DINT to INT *)
avg := sum / 5;

END_PROGRAM
