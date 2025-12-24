; ============================================================================
; ZPLC Example: Function Calls
; ============================================================================
;
; Demonstrates CALL and RET for subroutine calls.
;
; Main program:
;   1. Call add_five(3) -> result should be 8
;   2. Store result to output
;
; Function add_five(x):
;   Returns x + 5
;
; Variables:
;   result = OPI[0x1000] (32-bit output)
;
; Assemble: python tools/zplc_asm.py examples/05_function_call.asm -o examples/05_function_call.zplc
; ============================================================================

main:
        ; Push argument: x = 3
        PUSH8   3               ; Stack: [3]
        
        ; Call add_five function
        CALL    add_five        ; Stack: [result] after return
        
        ; Store result
        STORE32 0x1000          ; result := 8
        
        ; Exit
        HALT

; ============================================================================
; Function: add_five
; Input:  Stack top = x
; Output: Stack top = x + 5
; ============================================================================
add_five:
        ; x is already on stack
        PUSH8   5               ; Stack: [x, 5]
        ADD                     ; Stack: [x + 5]
        RET                     ; Return with result on stack
