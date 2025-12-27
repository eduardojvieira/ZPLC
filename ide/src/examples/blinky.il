(* ============================================================================
 * ZPLC Blinky - Instruction List (IL)
 * ============================================================================
 * IEC 61131-3 Instruction List implementation of a simple LED blinker.
 * 
 * This uses the same oscillating timer pattern as the LD and FBD versions:
 * Timer runs when LED is OFF, sets LED when done, which resets timer.
 * ============================================================================ *)

PROGRAM Blinky
VAR
    BlinkTimer : TON;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* ============================================================================
 * Instruction List Code
 * ============================================================================
 * 
 * IL Operators used:
 *   LD   - Load value into Current Result (CR)
 *   LDN  - Load negated value into CR
 *   ST   - Store CR to variable
 *   CAL  - Call function block
 * ============================================================================ *)

        (* Step 1: Call timer with inverted output as enable *)
        (* Timer runs when LED_Output is FALSE *)
        LDN     LED_Output
        ST      BlinkTimer.IN
        
        CAL     BlinkTimer(
                    PT := T#500ms
                )
        
        (* Step 2: Output = Timer.Q *)
        (* When timer done, LED turns ON, which resets timer *)
        LD      BlinkTimer.Q
        ST      LED_Output

END_PROGRAM

(* ============================================================================
 * How it works:
 * 
 * Cycle 1: LED_Output=FALSE
 *   - LDN LED_Output -> CR = TRUE (inverted FALSE)
 *   - ST BlinkTimer.IN -> Timer enabled
 *   - Timer starts counting
 *   - LD BlinkTimer.Q -> CR = FALSE (not done yet)
 *   - ST LED_Output -> LED stays OFF
 * 
 * After 500ms: LED_Output=FALSE, BlinkTimer.Q=TRUE
 *   - LDN LED_Output -> CR = TRUE
 *   - Timer still enabled, Q=TRUE
 *   - LD BlinkTimer.Q -> CR = TRUE
 *   - ST LED_Output -> LED turns ON
 * 
 * Next cycle: LED_Output=TRUE
 *   - LDN LED_Output -> CR = FALSE (inverted TRUE)
 *   - ST BlinkTimer.IN -> Timer disabled, resets
 *   - LD BlinkTimer.Q -> CR = FALSE (timer reset)
 *   - ST LED_Output -> LED turns OFF
 * 
 * And the cycle repeats...
 * ============================================================================ *)
