(* ============================================================================
 * ZPLC Golden Standard - Blinky in Instruction List (IL)
 * ============================================================================
 * IEC 61131-3 Instruction List implementation of a simple LED blinker.
 * 
 * IL is a low-level, assembly-like language. Each instruction operates on
 * an implicit "Current Result" (CR) register.
 * 
 * This program toggles output Q0.0 based on a timer.
 * ============================================================================ *)

PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
    TimerDone : BOOL;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* ============================================================================
 * Instruction List Code
 * ============================================================================
 * 
 * Operators:
 *   LD   - Load value into CR
 *   ST   - Store CR to variable
 *   AND  - Logical AND with CR
 *   OR   - Logical OR with CR
 *   NOT  - Negate CR
 *   S    - Set (latch) if CR is TRUE
 *   R    - Reset (unlatch) if CR is TRUE
 *   CAL  - Call function block
 *   JMP  - Unconditional jump
 *   JMPC - Jump if CR is TRUE
 *   RET  - Return
 * ============================================================================ *)

        (* Call the timer function block *)
        CAL     BlinkTimer(
                    IN := TRUE,
                    PT := T#500ms
                )
        
        (* Load timer done flag *)
        LD      BlinkTimer.Q
        ST      TimerDone
        
        (* If timer not done, skip toggle *)
        JMPCN   END_TOGGLE
        
        (* Toggle LED state: LedState := NOT LedState *)
        LD      LedState
        NOT
        ST      LedState
        
        (* Reset timer *)
        CAL     BlinkTimer(IN := FALSE)

END_TOGGLE:
        (* Output the LED state *)
        LD      LedState
        ST      LED_Output
        
        RET

END_PROGRAM

(* ============================================================================
 * IL to ZPLC Bytecode Mapping:
 * 
 * LD      -> LOAD8/16/32 (depending on type)
 * ST      -> STORE8/16/32
 * NOT     -> NOT opcode
 * AND     -> AND opcode
 * OR      -> OR opcode
 * JMPC    -> JNZ (jump if not zero)
 * JMPCN   -> JZ (jump if zero)
 * CAL     -> CALL to FB entry point
 * RET     -> RET opcode
 * ============================================================================ *)
