(* 
 * ZPLC OOP HIL Test
 * 
 * Tests IEC 61131-3 OOP extensions:
 * - FUNCTION_BLOCK with METHOD
 * - THIS keyword
 * - Method calls on FB instances
 * 
 * Memory Layout (OPI starts at 0x1000):
 * - 0x1000: test_passed BOOL
 * - 0x1002: counter_value INT (2 bytes) 
 * - 0x1004: method_result INT (2 bytes)
 * - 0x1006: cycle_count INT (2 bytes)
 *)

(* Simple Counter FB with Methods *)
FUNCTION_BLOCK FB_Counter
VAR
    Count : INT;
    MaxVal : INT;
END_VAR

(* Reset counter to zero *)
METHOD PUBLIC Reset : BOOL
    THIS.Count := 0;
    THIS.MaxVal := 100;
    Reset := TRUE;
END_METHOD

(* Increment counter by 1 and return new value *)
METHOD PUBLIC Increment : INT
    THIS.Count := THIS.Count + 1;
    Increment := THIS.Count;
END_METHOD

(* Get current count value *)
METHOD PUBLIC GetValue : INT
    GetValue := THIS.Count;
END_METHOD

(* Add 10 to counter *)
METHOD PUBLIC AddTen : INT
    THIS.Count := THIS.Count + 10;
    AddTen := THIS.Count;
END_METHOD

END_FUNCTION_BLOCK


PROGRAM OOPTest
VAR
    (* Output mappings for test verification *)
    test_passed AT %QX0.0 : BOOL := FALSE;  (* 0x1000 bit 0 *)
    counter_value AT %QW1 : INT;            (* 0x1002 *)
    method_result AT %QW2 : INT;            (* 0x1004 *)
    cycle_count AT %QW3 : INT;              (* 0x1006 *)
    
    (* FB instance *)
    myCounter : FB_Counter;
    
    (* Local variables *)
    initialized : BOOL := FALSE;
    temp : INT;
    cycles : INT := 0;
END_VAR

(* Increment cycle counter *)
cycles := cycles + 1;
cycle_count := cycles;

(* Only run initialization once *)
IF NOT initialized THEN
    (* Reset counter to zero *)
    myCounter.Reset();
    initialized := TRUE;
END_IF;

(* Each cycle: increment, then add 10 *)
(* Cycle 1: 0 -> 1 -> 11 *)
(* Cycle 2: 11 -> 12 -> 22 *)

temp := myCounter.Increment();
method_result := myCounter.AddTen();
counter_value := myCounter.GetValue();

(* Test passes if counter >= 11 (at least one full cycle completed) *)
IF counter_value >= 11 THEN
    test_passed := TRUE;
END_IF;

END_PROGRAM
