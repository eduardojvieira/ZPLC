(* ============================================================================
 * ZPLC Blinky - Structured Text (ST)
 * ============================================================================
 * IEC 61131-3 Structured Text implementation of a simple LED blinker.
 * 
 * This program toggles an output (Q0.0) every 500ms using a timer and
 * state variable approach for equal ON/OFF times.
 * ============================================================================ *)

PROGRAM Blinky
VAR
    (* Timer for 500ms delay *)
    BlinkTimer : TON;
    
    (* LED state: TRUE = ON, FALSE = OFF *)
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* Physical output: LED connected to Q0.0 *)
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* ============================================================================
 * Main Program Logic
 * ============================================================================ *)

(* Run timer continuously *)
BlinkTimer(IN := TRUE, PT := T#500ms);

(* When timer expires, toggle the LED and reset timer *)
IF BlinkTimer.Q THEN
    (* Toggle LED state using NOT *)
    LedState := NOT LedState;
    
    (* Reset timer by disabling then re-enabling *)
    BlinkTimer(IN := FALSE, PT := T#500ms);
END_IF;

(* Write LED state to physical output *)
LED_Output := LedState;

END_PROGRAM

(* ============================================================================
 * How it works:
 * 
 * 1. Timer runs continuously with IN := TRUE
 * 2. After 500ms, Timer.Q becomes TRUE
 * 3. IF block detects Timer.Q and:
 *    - Toggles LedState (FALSE -> TRUE or TRUE -> FALSE)
 *    - Resets timer by calling with IN := FALSE
 * 4. Next scan: Timer.Q is FALSE, IF block skipped
 * 5. Timer restarts counting (IN := TRUE on first line)
 * 6. After another 500ms, repeat from step 2
 * 
 * Result: LED toggles every 500ms (1Hz blink rate with 50% duty cycle)
 * ============================================================================ *)
