(* ============================================================================
 * ZPLC Blinky - Instruction List (IL)
 * ============================================================================
 * IEC 61131-3 Instruction List implementation of a 50% LED blinker.
 *
 * Same construction as the Ladder and FBD versions: two TON timers and a
 * SET/RESET output. OffTimer times the OFF half period and sets the LED,
 * OnTimer times the ON half period and resets it.
 * ============================================================================ *)

PROGRAM Blinky
VAR
    OffTimer : TON;
    OnTimer  : TON;
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
 *   S    - Set operand to TRUE when CR is TRUE
 *   R    - Reset operand to FALSE when CR is TRUE
 *   CAL  - Call function block
 * ============================================================================ *)

        (* Step 1: OFF phase - OffTimer counts while the LED is OFF *)
        LDN     LED_Output
        ST      OffTimer.IN
        CAL     OffTimer(
                    PT := T#500ms
                )

        (* Step 2: ON phase - OnTimer counts while the LED is ON *)
        LD      LED_Output
        ST      OnTimer.IN
        CAL     OnTimer(
                    PT := T#500ms
                )

        (* Step 3: OffTimer done -> LED ON *)
        LD      OffTimer.Q
        S       LED_Output

        (* Step 4: OnTimer done -> LED OFF *)
        LD      OnTimer.Q
        R       LED_Output

END_PROGRAM

(* ============================================================================
 * How it works:
 *
 * LED OFF:  Step 1 enables OffTimer, Step 2 holds OnTimer reset.
 *           After 500 ms OffTimer.Q is TRUE and Step 3 sets LED_Output.
 *
 * LED ON:   Step 1 disables (resets) OffTimer, Step 2 enables OnTimer.
 *           After 500 ms OnTimer.Q is TRUE and Step 4 resets LED_Output.
 *
 * Result: about 500 ms ON, 500 ms OFF (each phase is 500 ms plus one 10 ms
 * scan), a 50% duty cycle. tests/blinky-il.scenario.json checks both halves.
 *
 * A single TON fed by LDN LED_Output would not do: as soon as the LED turns
 * ON the timer is disabled and the LED turns OFF on the next scan, a blip of
 * one scan every 520 ms.
 * ============================================================================ *)
