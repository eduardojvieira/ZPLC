; ============================================================================
; ZPLC Example: Simple Addition (C = A + B)
; ============================================================================
;
; This example demonstrates:
;   - Loading values from Input Process Image (IPI)
;   - Basic arithmetic operations
;   - Storing results to Output Process Image (OPI)
;
; Memory Map:
;   IPI (0x0000-0x0FFF): Inputs - Read by VM, written by HAL
;   OPI (0x1000-0x1FFF): Outputs - Written by VM, read by HAL
;
; Variables:
;   A = IPI[0x0000] (16-bit)
;   B = IPI[0x0002] (16-bit)
;   C = OPI[0x1000] (16-bit) = A + B
;
; Assemble: python tools/zplc_asm.py examples/02_addition.asm -o examples/02_addition.zplc
; ============================================================================

; Define symbolic addresses
; (Note: These are just comments - the assembler doesn't support .EQU yet)
; A_ADDR = 0x0000
; B_ADDR = 0x0002
; C_ADDR = 0x1000

start:
        ; Load A from input
        LOAD16  0x0000          ; Stack: [A]
        
        ; Load B from input
        LOAD16  0x0002          ; Stack: [A, B]
        
        ; Add them
        ADD                     ; Stack: [A+B]
        
        ; Store result to output
        STORE16 0x1000          ; Stack: []
        
        ; Done
        HALT
