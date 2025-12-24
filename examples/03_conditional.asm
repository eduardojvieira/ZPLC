; ============================================================================
; ZPLC Example: Conditional Logic
; ============================================================================
;
; Implements: IF (A > 10) THEN B := 1 ELSE B := 0 END_IF
;
; This example demonstrates:
;   - Comparison operations (GT)
;   - Conditional jumps (JZ - jump if zero/false)
;   - Labels and branching
;
; Variables:
;   A = IPI[0x0000] (16-bit input)
;   B = OPI[0x1000] (16-bit output)
;
; Assemble: python tools/zplc_asm.py examples/03_conditional.asm -o examples/03_conditional.zplc
; ============================================================================

start:
        ; Load A
        LOAD16  0x0000          ; Stack: [A]
        
        ; Push comparison constant
        PUSH8   10              ; Stack: [A, 10]
        
        ; Compare: A > 10?
        GT                      ; Stack: [result] (1 if true, 0 if false)
        
        ; Jump to else_branch if false (result == 0)
        JZ      else_branch     ; Consumes result from stack
        
then_branch:
        ; A > 10: Set B = 1
        PUSH8   1               ; Stack: [1]
        STORE16 0x1000          ; B := 1
        JMP     done            ; Skip else branch
        
else_branch:
        ; A <= 10: Set B = 0
        PUSH8   0               ; Stack: [0]
        STORE16 0x1000          ; B := 0
        
done:
        HALT
