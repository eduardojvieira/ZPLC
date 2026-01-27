PROGRAM MasterBlinky
VAR
    fast_tmr : TON;
    slow_tmr : TON;
    
    fast_state AT %Q0.1 : BOOL; (* GP1 *)
    slow_state AT %Q0.0 : BOOL; (* GP0 *)
    
    cycle_count : INT := 0;
END_VAR

(* Fast Blinky (100ms ON / 100ms OFF) *)
fast_tmr(IN := NOT fast_tmr.Q, PT := T#100ms);
IF fast_tmr.Q THEN
    fast_state := NOT fast_state;
END_IF;

(* Slow Blinky (500ms ON / 500ms OFF) *)
slow_tmr(IN := NOT slow_tmr.Q, PT := T#500ms);
IF slow_tmr.Q THEN
    slow_state := NOT slow_state;
END_IF;

cycle_count := cycle_count + 1;

END_PROGRAM
