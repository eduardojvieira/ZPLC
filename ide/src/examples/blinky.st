(* ============================================================================
 * ZPLC Golden Standard - Blinky in Structured Text (ST)
 * ============================================================================
 * IEC 61131-3 Structured Text implementation of a simple LED blinker.
 * 
 * This program toggles an output (Q0.0) every 500ms.
 * It demonstrates:
 *   - Variable declarations with types
 *   - Timer function blocks (TON)
 *   - IF/ELSE conditional logic
 *   - Boolean negation
 * ============================================================================ *)

PROGRAM Blinky
VAR
    (* Timer for 500ms delay *)
    BlinkTimer : TON;
    
    (* LED state: TRUE = ON, FALSE = OFF *)
    LedState : BOOL := FALSE;
    
    (* Blink interval in milliseconds *)
    BlinkInterval : TIME := T#500ms;
END_VAR

VAR_OUTPUT
    (* Physical output: LED connected to Q0.0 *)
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* ============================================================================
 * Main Program Logic
 * ============================================================================ *)

(* Start the timer with current LED state as trigger *)
BlinkTimer(IN := TRUE, PT := BlinkInterval);

(* When timer expires, toggle the LED *)
IF BlinkTimer.Q THEN
    (* Toggle LED state *)
    LedState := NOT LedState;
    
    (* Reset timer by retriggering *)
    BlinkTimer(IN := FALSE);
END_IF;

(* Write LED state to physical output *)
LED_Output := LedState;

END_PROGRAM

(* ============================================================================
 * Expected Compilation to ZPLC Bytecode:
 * 
 * The compiler should generate:
 * 1. Timer FB instance in Work Memory
 * 2. Cyclic read of timer output
 * 3. Conditional toggle of LedState
 * 4. Store to OPI[0] bit 0
 * ============================================================================ *)
